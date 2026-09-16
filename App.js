/**
 * VANTA PRIVACY PROTOCOL — WebView Shell
 * 
 * Your exact HTML design renders in the WebView.
 * This shell bridges the MWA wallet connection:
 *   WebView postMessage → React Native → MWA transact() → result back to WebView
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { Buffer } from 'buffer';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Hermes doesn't have Buffer — polyfill it globally before anything uses it
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Resolve the HTML asset to a local file URI
const htmlAsset = Asset.fromModule(require('./web/vanta.html'));

export default function App() {
  const webViewRef = useRef(null);
  const [htmlUri, setHtmlUri] = useState(null);

  useEffect(() => {
    (async () => {
      await htmlAsset.downloadAsync();
      setHtmlUri(htmlAsset.localUri);
    })();
  }, []);

  // Send a message back to the WebView's JavaScript
  const sendToWeb = useCallback((jsCode) => {
    webViewRef.current?.injectJavaScript(jsCode);
  }, []);

  // Handle messages from the WebView
  const onMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'CONNECT_WALLET') {
        // WebView asked us to connect a wallet via MWA
        try {
          await transact(async (wallet) => {
            const auth = await wallet.authorize({
              cluster: 'devnet',
              identity: {
                name: 'Vanta Privacy Protocol',
                uri: 'https://vanta.protocol',
              },
            });

            const raw = auth.accounts[0].publicKey;
            const pubkey = typeof raw === 'string'
              ? new PublicKey(raw)
              : new PublicKey(Buffer.from(raw));

            const address = pubkey.toBase58();
            const lamports = await connection.getBalance(pubkey);
            const balance = (lamports / LAMPORTS_PER_SOL).toFixed(4);

            // Tell the WebView: wallet connected successfully
            sendToWeb(`onWalletConnected('${address}', ${balance});`);
          });
        } catch (err) {
          console.log('VANTA CONNECT ERROR:', err.message, err.code || '', JSON.stringify(err.userInfo || err.data || {}).slice(0, 300));
          // Wallet connection failed — tell WebView to reset
          sendToWeb(`
            document.getElementById('status-badge').className = "flex items-center space-x-2 bg-gray-800 text-gray-400 px-5 py-1.5 rounded-full font-bold text-xs tracking-wide transition-all duration-300 hover:scale-105";
            document.getElementById('status-text').textContent = "Connection failed";
            document.getElementById('power-pulse').style.opacity = '0';
            document.getElementById('power-btn').className = "relative w-36 h-36 sm:w-40 sm:h-40 rounded-[2.2rem] bg-gray-800 shadow-none border border-gray-700 flex items-center justify-center transition-all duration-300 hover:scale-105 opacity-80 cursor-pointer";
          `);
        }
      }

      if (data.type === 'SHIELD_OFF') {
        // Shield deactivated — nothing to do on native side
        console.log('Shield deactivated');
      }

      if (data.type === 'STEALTH_SEND') {
        // WebView asked us to send a stealth transaction
        try {
          const { StealthAddress } = require('./src/stealth/stealth');
          const recipient = StealthAddress.generateRecipient();
          const stealth = StealthAddress.generateStealthAddress(recipient.metaAddress);
          const stealthPubkey = new PublicKey(stealth.stealthAddress);

          await transact(async (wallet) => {
            const auth = await wallet.authorize({
              cluster: 'devnet',
              identity: { name: 'Vanta Privacy Protocol' },
            });
            const fromPubkey = new PublicKey(auth.accounts[0].publicKey);

            const tx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey,
                toPubkey: stealthPubkey,
                lamports: 0.01 * LAMPORTS_PER_SOL,
              })
            );
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = fromPubkey;

            const sigs = await wallet.signAndSendTransactions({ transactions: [tx] });
            const sig = typeof sigs[0] === 'string' ? sigs[0] : sigs[0].toString();

            // Tell WebView the stealth tx was sent
            sendToWeb(`onStealthTxSent();`);
          });
        } catch (err) {
          console.error('Stealth send failed:', err);
        }
      }
    } catch (parseErr) {
      // Not JSON, ignore
    }
  }, [sendToWeb]);

  return (
    <View style={styles.container}>
      <ExpoStatusBar style="light" />
      {htmlUri && (
      <WebView
        ref={webViewRef}
        source={{ uri: htmlUri }}
        style={styles.webview}
        onMessage={onMessage}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        androidHardwareAccelerationEnabled={true}
        androidLayerType="hardware"
        renderToHardwareTextureAndroid={true}
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, bottom: 0 }}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  webview: {
    flex: 1,
    backgroundColor: '#07090E',
  },
});

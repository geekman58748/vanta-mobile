/**
 * Terms of Use content, rendered by components/Legal.jsx.
 *
 * Every statement here is checked against the repository: the custody model from
 * the FAQ, the devnet/unaudited disclosure from the README, the audit finding
 * that shaped the relayer's data policy (AUDIT-2026-09-27 C2), and the licence
 * from LICENSE (Apache-2.0). If the product changes, change this file with it.
 *
 * House rules for this copy: no em dashes, no first person plural promises the
 * code does not keep, and no anonymity claim anywhere. The brand is
 * "confidential, never anonymous".
 */

export const TERMS = {
  path: '/terms',
  eyebrow: 'Legal',
  title: 'Terms of Use',
  lede:
    'The rules, the risks and the limits of using Vanta. Written to be read, not to be skimmed past. If a sentence here disagrees with the app, the app is wrong and so is the sentence.',
  updated: 'Last updated 22 October 2026',
  sections: [
    {
      id: 'what-it-is',
      h: 'What Vanta is',
      body: [
        {
          type: 'p',
          text: 'Vanta is open-source software: a privacy wallet for Android built on the Solana Mobile stack, running on Solana devnet. It is published under the Apache License 2.0 and developed in public.',
        },
        {
          type: 'p',
          text: 'Vanta is not a bank, an exchange, a payment processor, an escrow service or a custodian. It holds no customer funds on your behalf and has no account system, no support desk and no ability to restore access on your behalf.',
        },
      ],
    },
    {
      id: 'devnet',
      h: 'Devnet only, and no real funds',
      body: [
        {
          type: 'p',
          text: 'Vanta runs on Solana devnet. Devnet SOL is worthless test currency obtained from a faucet. Nothing in this software is production infrastructure, and it has not been audited by a third party.',
        },
        {
          type: 'note',
          text: 'Do not put real funds into Vanta. Do not build anything that depends on it holding real money, keeping a balance, or keeping a promise about what will exist in a later version.',
        },
      ],
    },
    {
      id: 'custody',
      h: 'Custody: your keys, your notes',
      body: [
        {
          type: 'p',
          text: 'Your private balance is derived from a seed phrase generated on your device. Shielded funds exist as encrypted notes inside a shared pool controlled by an on-chain program, which behaves like a bearer claim: whoever holds the spending keys can spend them, and nobody else can.',
        },
        {
          type: 'list',
          items: [
            'If you lose your seed, the notes cannot be spent by anyone, including us. There is no recovery path.',
            'If someone else obtains your seed, they can spend your notes. Whoever holds the device keys holds the funds.',
            'The pool program is currently upgradeable, and its upgrade authority is held by a key. Whoever holds that authority can change the rules the pool obeys. This is disclosed on the landing page and in the repository.',
          ],
        },
      ],
    },
    {
      id: 'risks',
      h: 'Risks you accept by using Vanta',
      body: [
        {
          type: 'p',
          text: 'This is experimental software operating on a public blockchain. Using it means accepting all of the following:',
        },
        {
          type: 'list',
          items: [
            'The cryptography may contain bugs. No third-party audit has been performed.',
            'The privacy rails are a third-party alpha service on devnet. They can change, break or be withdrawn without any change to this repository.',
            'The Vanta custom ring is in test phase, is unaudited, and is operated under a single-key authority. The published Android build still spends on the default ring unless the ring program is configured.',
            'The relayer that sponsors private spends sees the transactions it sponsors, and it currently has no authentication. It is infrastructure in development, not a hardened public service.',
            'On-chain data is permanent and public. A privacy guarantee that holds today can be weakened by a later tool, a later disclosure, or an action of your own that links an address to you.',
            'Validator, client and network behaviour can lose, delay or reorder transactions. Nothing here guarantees finality, availability or speed.',
          ],
        },
      ],
    },
    {
      id: 'your-responsibilities',
      h: 'What is your responsibility',
      body: [
        {
          type: 'list',
          items: [
            'Backing up and protecting your seed phrase and any viewing keys. That is the only key material there is.',
            'Verifying any claim made about this software. Every on-chain figure on this site links to a devnet signature you can decode yourself.',
            'Deciding whether a privacy tool is appropriate for your situation, and complying with the law that applies to you. Vanta does not make any activity lawful.',
            'Treating handles and addresses as public. Registering a handle publishes its owner address on chain by design.',
          ],
        },
      ],
    },
    {
      id: 'not-promised',
      h: 'What is not promised',
      body: [
        {
          type: 'p',
          text: 'Vanta is provided as is, without warranty of any kind, express or implied. To the maximum extent the law allows, the people who build it are not liable for any loss of funds, loss of profit, loss of data, loss of privacy or consequential damage arising from its use.',
        },
        {
          type: 'p',
          text: 'Nothing on this site or in this software is financial, legal, investment or tax advice. Receipts, screenshots and transaction examples reflect specific past transactions on devnet and are not a prediction of what any future version will do.',
        },
      ],
    },
    {
      id: 'third-party',
      h: 'Third-party components',
      body: [
        {
          type: 'p',
          text: 'Vanta stands on other people’s work: the Solana network, the Mobile Wallet Adapter, and the Helius Zolana privacy libraries that provide the pools, circuits and prover. Those components carry their own licences and their own terms, listed in the NOTICE file in the repository. Their availability and behaviour are outside this project’s control.',
        },
      ],
    },
    {
      id: 'acceptable-use',
      h: 'Acceptable use',
      body: [
        {
          type: 'p',
          text: 'Use Vanta lawfully. Do not use it to misrepresent what the software does, to imply a level of anonymity it does not provide, or to interfere with the relayer, the faucet or the on-chain programs it depends on. Automated access to the relayer is subject to the per-address limits it enforces.',
        },
      ],
    },
    {
      id: 'changes',
      h: 'Changes',
      body: [
        {
          type: 'p',
          text: 'The software changes often, sometimes between builds, because it depends on an upstream alpha service. This page changes with it. The version at the top of the page is the version in force, and continued use after a change means acceptance of the change.',
        },
      ],
    },
    {
      id: 'contact',
      h: 'Questions',
      body: [
        {
          type: 'p',
          text: 'There is no support desk and no service level. Bugs, security reports and questions go to the issue tracker on the repository, where they are answered in public.',
        },
        {
          type: 'p',
          text: 'See also the Privacy Policy, which covers what this software and its infrastructure do and do not collect about you.',
        },
      ],
    },
  ],
}

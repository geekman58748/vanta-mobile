/**
 * Privacy Policy content, rendered by components/Legal.jsx.
 *
 * Every field named here is checked against what the code actually does:
 *
 * - `relayer/schema.sql`: the `transactions`, `vanta_names` and `waitlist`
 *   tables, including the columns that were dropped after AUDIT-2026-09-27 C2.
 * - `relayer/server.js`: rate limiting is done against in-memory windows keyed
 *   by request IP; the address is never written to the database.
 * - `landing/src/components/WaitlistModal.jsx`: the only form on this site, and
 *   the only thing it posts.
 *
 * A privacy policy is the easiest page in a product to get wrong, because the
 * temptation is to describe the product you wish you had. This one describes the
 * schema. If you add a column, update this file in the same commit.
 */

export const PRIVACY = {
  path: '/privacy',
  eyebrow: 'Legal',
  title: 'Privacy Policy',
  lede:
    'What Vanta collects, where it goes, and what it deliberately refuses to keep. For a product that sells privacy, the honest version of this page is part of the product.',
  updated: 'Last updated 22 October 2026',
  sections: [
    {
      id: 'summary',
      h: 'The short version',
      body: [
        {
          type: 'list',
          items: [
            'This website sets no cookies, loads no analytics and carries no advertising trackers.',
            'There are no accounts. Nobody signs in, and there is no profile to delete.',
            'The wallet keeps your seed and your private notes on your device. They are never transmitted.',
            'The relayer stores a transaction record with signatures and addresses, and deliberately stores no amounts and no recipients.',
            'Everything that happens on chain is public forever. That is the chain’s property, not ours, and no wallet can undo it.',
          ],
        },
      ],
    },
    {
      id: 'you-give',
      h: 'What you give us directly',
      body: [
        {
          type: 'p',
          text: 'The only form on this site is the waitlist card. It posts four fields to the relayer service:',
        },
        {
          type: 'list',
          items: [
            'email: so a build announcement can reach you',
            'device: what you told us you are running on',
            'wants: what you said you are interested in',
            'note: anything else you typed',
          ],
        },
        {
          type: 'p',
          text: 'Those rows land in a single `waitlist` table. Nothing else on this site submits data anywhere.',
        },
      ],
    },
    {
      id: 'relayer-records',
      h: 'Transaction records the relayer keeps',
      body: [
        {
          type: 'p',
          text: 'The relayer sponsors network fees for private spends, so it observes what it sponsors. Each sponsored transaction is stored as one row containing:',
        },
        {
          type: 'list',
          items: [
            'transaction signature, network, status and error',
            'the kind of movement: shield, shadow, ghost, register, fund, send',
            'whether the relayer observed it or the client reported it',
            'the addresses that signed, and which programs the transaction touched',
            'slot and block time',
          ],
        },
        {
          type: 'p',
          text: 'Your phone’s request address is used to rate-limit abuse. It is held in memory for the duration of the window and never written to the database.',
        },
      ],
    },
    {
      id: 'not-collected',
      h: 'What is deliberately not collected',
      body: [
        {
          type: 'note',
          text: 'The relayer must not hold the payment graph. That rule is enforced by the schema, not by good intentions.',
        },
        {
          type: 'list',
          items: [
            'Your seed phrase, viewing key and nullifier keys. They never leave the device.',
            'The amount and the recipient of a private send. An earlier build reported these fields to build a client-side history; a security finding showed that the record was readable by anyone holding the token the app ships, which handed over exactly the graph the product exists to hide. Those fields are no longer sent, are no longer accepted, and the stored copies are dropped on the next restart.',
            'Analytics, session replay, device fingerprints, advertising identifiers. None are present in the app or on this site.',
            'Your contact address is never shared, sold or used for anything except the announcement you asked for.',
          ],
        },
      ],
    },
    {
      id: 'public-chain',
      h: 'What is public by design',
      body: [
        {
          type: 'p',
          text: 'Solana is a public ledger. Every transaction is permanently readable, including the fee payer, the signer set, the programs called and the timestamps. Vanta cannot make chain data private; it can only make the parts of a payment that would otherwise be plain text be encrypted instead.',
        },
        {
          type: 'p',
          text: 'That leaves real exposure, and this product names it rather than hiding it:',
        },
        {
          type: 'list',
          items: [
            'The sender identity that pays a spend is visible, and in the current build it is reused across sends.',
            'Registering a handle publishes its owner address on chain.',
            'A shield deposit is a public event: observers can see that an address funded a pool, even if they cannot see where it later pays out.',
            'Confidential, never anonymous. Anyone you hand an address to can recognise it again.',
          ],
        },
      ],
    },
    {
      id: 'how-protected',
      h: 'How your privacy is protected',
      body: [
        {
          type: 'list',
          items: [
            'Data minimisation by schema: the sensitive columns were removed from the database, so no future bug in a query can expose what is not stored.',
            'The relayer is served over HTTPS, and the repository publishes the source of every line of it.',
            'Any token the app ships must be treated as public. Anything readable by it was purged, which is what drove the finding above.',
            'The app and the site carry no third-party trackers, so there is no third party to receive data in the first place.',
          ],
        },
      ],
    },
    {
      id: 'retention',
      h: 'Retention and deletion',
      body: [
        {
          type: 'p',
          text: 'Vanta runs on devnet for development and testing. Its databases and its on-chain state may be reset, migrated or wiped at any time without notice, and nothing here should be relied on as a durable record.',
        },
        {
          type: 'p',
          text: 'To have a waitlist row removed, open an issue on the repository with the address you signed up with. There is no automated deletion flow and no service level, and on-chain data cannot be deleted by anyone.',
        },
      ],
    },
    {
      id: 'children',
      h: 'Children',
      body: [
        {
          type: 'p',
          text: 'Vanta is not directed at anyone under 18, and it collects no information knowingly from children.',
        },
      ],
    },
    {
      id: 'changes',
      h: 'Changes',
      body: [
        {
          type: 'p',
          text: 'This policy is versioned with the software. The date at the top is the version in force. A change to what is collected means a change to this page, published in the same repository as the code it describes.',
        },
      ],
    },
    {
      id: 'contact',
      h: 'Questions',
      body: [
        {
          type: 'p',
          text: 'Questions about data, or a request to delete a row, go to the issue tracker on the repository.',
        },
        {
          type: 'p',
          text: 'See also the Terms of Use, which covers the risks and limits of using the software itself.',
        },
      ],
    },
  ],
}

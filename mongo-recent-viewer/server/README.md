# Mongo Latest Viewer (psp.livedata)

- Polls for **the single latest** document (sorted by `ts` descending).
- Prepends new rows to the top of the table.
- Refreshes every **500 ms**.

## Setup to get latest row

```bash
cd server
cp .env
npm install
npm start
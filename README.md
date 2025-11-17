# Node + Express Service Starter

This is a simple API sample in Node.js with express.js based on [Google Cloud Run Quickstart](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service).

## Getting Started

Server should run automatically when starting a workspace. To run manually, run:
```sh
npm run dev
```
## Configuration

### CORS (Cross-Origin Resource Sharing)

The API supports multiple allowed origins for CORS. Configure using the `ALLOWED_ORIGIN` environment variable:

- **Single origin**: `ALLOWED_ORIGIN=https://example.com`
- **Multiple origins**: `ALLOWED_ORIGIN=https://example.com,https://app.example.com,https://dashboard.example.com`
- **Allow all origins**: `ALLOWED_ORIGIN=*` (default, not recommended for production)

Example `.env` configuration:
```env
ALLOWED_ORIGIN=https://realmkin.com,https://app.realmkin.com
```
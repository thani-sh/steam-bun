import { $ } from "bun";

// Read package.json
const packageJson = await Bun.file("package.json").json();
const packageName = packageJson.name;
const packageVersion = packageJson.version;

console.log(`Checking package: ${packageName} version: ${packageVersion}`);

// Check if version exists
const registryUrl = `https://registry.npmjs.org/${packageName}/${packageVersion}`;
const checkResponse = await fetch(registryUrl, { method: "HEAD" });

if (checkResponse.ok) {
  console.log(`Version ${packageVersion} of ${packageName} already exists.`);
  process.exit(0);
}

console.log(`Version ${packageVersion} does not exist on npmjs.`);

const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;

if (!requestToken || !requestUrl) {
  console.error("OIDC environment variables must be set.");
  process.exit(1);
}

// Request OIDC token from GitHub
console.log("Requesting OIDC token from GitHub...");
const oidcResponse = await fetch(
  `${requestUrl}&audience=npm:registry.npmjs.org`,
  { headers: { Authorization: `Bearer ${requestToken}` } },
);

if (!oidcResponse.ok) {
  console.error(`Failed to obtain OIDC token: ${oidcResponse.statusText}`);
  process.exit(1);
}

const oidcData = await oidcResponse.json();
const oidcToken = oidcData.value;

if (!oidcToken) {
  console.error("OIDC token value is missing in response.");
  process.exit(1);
}

// URL encode package name
const encodedPackageName = encodeURIComponent(packageName);

// Exchange OIDC token for npm token
console.log("Exchanging OIDC token for npmjs token...");
const exchangeUrl = `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodedPackageName}`;
const exchangeResponse = await fetch(exchangeUrl, {
  method: "POST",
  headers: { Authorization: `Bearer ${oidcToken}` },
});

if (!exchangeResponse.ok) {
  console.error(`Failed to exchange token: ${exchangeResponse.statusText}`);
  process.exit(1);
}

const exchangeData = await exchangeResponse.json();
const npmToken = exchangeData.token;

if (!npmToken) {
  console.error("NPM token value is missing in exchange response.");
  process.exit(1);
}

// Write token to .npmrc
console.log("Configuring .npmrc...");
await Bun.write(".npmrc", `//registry.npmjs.org/:_authToken=${npmToken}\n`);

// Publish package using bun publish
console.log("Publishing package...");
await $`bun publish`;

import crypto from "node:crypto";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
console.log("POLICY_SIGNING_PRIVATE_KEY_B64=" + Buffer.from(privateKey, "utf8").toString("base64"));
console.log("\n--- PUBLIC KEY (configure in Windows agent) ---\n" + publicKey);
console.log("\nIMPORTANTE: guarde a chave privada em um gerenciador de segredos no servidor. Nunca a commit no Git.");

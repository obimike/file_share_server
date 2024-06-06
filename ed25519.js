const sodium = require("libsodium-wrappers");


 const generateKeys = async () => {
  await sodium.ready;
  const keypair = await sodium.crypto_sign_keypair();
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
  };
};

 const retrieveUint8ArrayFromBase64 = (base64String) => {
  const charArray = atob(base64String).split("");
  const uint8Array = new Uint8Array(charArray.length);
  for (let i = 0; i < charArray.length; i++) {
    uint8Array[i] = charArray[i].charCodeAt(0);
  }
  return uint8Array;
};

module.exports = {
    generateKeys,
    retrieveUint8ArrayFromBase64
};
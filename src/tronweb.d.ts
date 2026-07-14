declare module 'tronweb' {
  const TronWeb: {
    address: {
      fromHex(hex: string): string;
      toHex(address: string): string;
    };
  };
  export default TronWeb;
}

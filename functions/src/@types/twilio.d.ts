declare module "twilio" {
  export function validateRequest(
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, any>,
  ): boolean;

  const twilio: {
    validateRequest: typeof validateRequest;
  };

  export default twilio;
}

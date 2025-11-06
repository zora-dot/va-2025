import twilio = require("twilio");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FLOW_SID,
  TWILIO_FROM = "+17787714625",
} = process.env;

type TwilioFactory = (sid: string, token: string) => TwilioClient;
type TwilioClient = {
  studio: {
    v2: {
      flows: (sid: string) => {
        executions: {
          create: (params: { to: string; from: string; parameters: Record<string, unknown> }) => Promise<unknown>
        }
      }
    }
  }
};

const createTwilioClient = twilio as unknown as TwilioFactory;
let cachedClient: TwilioClient | null = null;

const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }
  cachedClient = createTwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return cachedClient;
};

/**
 * Trigger the Studio Flow that sends booking confirmations via SMS.
 * Reuse this helper inside booking flows instead of hitting Messaging Services directly.
 */
export function sendBookingSms(to: string, message: string, from = TWILIO_FROM ?? "+17787714625") {
  if (!TWILIO_FLOW_SID) {
    throw new Error("Twilio Flow SID missing. Set TWILIO_FLOW_SID.");
  }
  const client = getClient();
  return client.studio.v2.flows(TWILIO_FLOW_SID).executions.create({
    to,
    from,
    parameters: { to, from, message },
  });
}

/**
 * Its Role (The Signboard):

Mounts the two DigiLocker endpoints:

POST /aadhaar/initiate ➔ Generates the DigiLocker link.
GET /aadhaar/:clientId ➔ Fetches the verified Aadhaar report once the user completes the OTP.
 */
import {
  aadhaarInitiateSchema,
  aadhaarStatusSchema,
} from "./aadhaar.schema.js";

/**
 * Aadhaar DigiLocker Routes
 * Mounted under Fastify
 */
export async function aadhaarRoutes(fastify, { controller }) {
  // 1. Initiate DigiLocker session
  fastify.post("/aadhaar/initiate", {
    schema: aadhaarInitiateSchema,
    handler: controller.initiate,
  });

  // 2. Fetch verified Aadhaar details
  fastify.get("/aadhaar/:clientId", {
    schema: aadhaarStatusSchema,
    handler: controller.getDetails,
  });

  // 3. Browser Callback Endpoint to redirect back to mobile app
  fastify.get("/aadhaar/callback", async (request, reply) => {
    const rawUrl = request.raw?.url || request.url || "";
    const queryIdx = rawUrl.indexOf("?");
    const queryStr = queryIdx !== -1 ? rawUrl.slice(queryIdx) : "";
    const appDeepLink = `equiprent://aadhaar${queryStr}`;

    reply.type("text/html").send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DigiLocker Verification</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #F8FAFC; color: #0F172A; text-align: center; }
          .card { background: #FFFFFF; border-radius: 16px; padding: 32px 24px; max-width: 380px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); margin: 20px; }
          .icon { width: 60px; height: 60px; border-radius: 30px; background: #DCFCE7; color: #16A34A; display: inline-flex; align-items: center; justify-content: center; font-size: 30px; margin-bottom: 16px; font-weight: bold; }
          h2 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
          p { color: #64748B; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
          .btn { display: block; width: 100%; box-sizing: border-box; padding: 14px 0; background: #EA580C; color: #FFFFFF; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h2>Authentication Successful</h2>
          <p>Your Aadhaar e-KYC has been authenticated on DigiLocker. Returning to the EquipRent app...</p>
          <a href="${appDeepLink}" class="btn">Return to EquipRent App</a>
        </div>
        <script>
          window.location.href = "${appDeepLink}";
          setTimeout(function() { window.location.href = "${appDeepLink}"; }, 500);
        </script>
      </body>
      </html>
    `);
  });
}

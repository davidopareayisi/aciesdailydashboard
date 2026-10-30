// Server-side SMS transport. Imported only by the verification service and offline tests.
/**
 * @param {string} phone Normalized international phone number.
 * @param {string} code
 * @param {"verify" | "reset"} purpose
 */
export async function sendMnotifyCode(phone, code, purpose, {
  apiKey = process.env.MNOTIFY_API_KEY,
  sender = process.env.MNOTIFY_SENDER_ID,
  fetcher = fetch,
} = {}) {
  // Never propagate provider errors: they can contain the API key, recipient or OTP.
  try {
    if (!apiKey?.trim() || !sender || !/^[a-zA-Z0-9 ]{1,11}$/.test(sender) || !/^\+[1-9]\d{6,14}$/.test(phone) || !/^\d{6}$/.test(code)) {
      throw new Error("Invalid SMS configuration or input.");
    }
    const endpoint = new URL("https://api.mnotify.com/api/sms/quick");
    endpoint.searchParams.set("key", apiKey.trim());
    const action = purpose === "reset" ? "password reset" : "verification";
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: [phone.slice(1)],
        sender,
        message: `Your AciesDaily ${action} code is ${code}. It expires in 5 minutes. Do not share this code.`,
        is_schedule: false,
        sms_type: "otp",
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("SMS request failed.");
    const result = await response.json();
    // HTTP 200 alone does not mean the provider accepted the SMS.
    if (result?.status !== "success" || String(result.code) !== "2000" ||
      Number(result.summary?.total_sent) !== 1 || Number(result.summary?.total_rejected) !== 0) {
      throw new Error("SMS was not accepted.");
    }
  } catch {
    throw new Error("SMS delivery is unavailable.");
  }
}

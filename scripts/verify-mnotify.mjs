import assert from "node:assert/strict";
import { test } from "node:test";
import { sendMnotifyCode } from "../app/lib/mnotify.mjs";

const options = { apiKey: "offline-test-key", sender: "AciesBms" };
const accepted = { status: "success", code: "2000", summary: { total_sent: 1, total_rejected: 0 } };

test("verification and recovery submit OTP SMS to the documented endpoint", async () => {
  for (const purpose of ["verify", "reset"]) {
    let calls = 0;
    await sendMnotifyCode("+233241234567", "123456", purpose, { ...options, fetcher: async (url, init) => {
      calls++;
      assert.equal(url.origin + url.pathname, "https://api.mnotify.com/api/sms/quick");
      assert.equal(url.searchParams.get("key"), options.apiKey);
      assert.equal(init.method, "POST");
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload.recipient, ["233241234567"]);
      assert.equal(payload.sender, "AciesBms");
      assert.equal(payload.sms_type, "otp");
      assert.equal(payload.is_schedule, false);
      assert.match(payload.message, purpose === "reset" ? /password reset code is 123456/ : /verification code is 123456/);
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      return Response.json(accepted);
    } });
    assert.equal(calls, 1);
  }
});

test("provider rejection, pending sender, malformed responses and network failures fail safely", async () => {
  const responses = [
    Response.json({ status: "error", code: "1000", message: "Sender pending review" }),
    Response.json({ ...accepted, summary: { total_sent: 0, total_rejected: 1 } }),
    Response.json({ status: "success", code: "2000" }),
    new Response("unavailable", { status: 503 }),
    new Response("invalid json"),
  ];
  for (const response of responses) {
    await assert.rejects(sendMnotifyCode("+233241234567", "123456", "verify", {
      ...options, fetcher: async () => response,
    }), { message: "SMS delivery is unavailable." });
  }
  await assert.rejects(sendMnotifyCode("+233241234567", "123456", "verify", {
    ...options, fetcher: async () => { throw new Error("secret recipient OTP URL"); },
  }), { message: "SMS delivery is unavailable." });
});

test("missing credentials and invalid sender or recipient never send requests", async () => {
  const fetcher = async () => { assert.fail("No network request should be made"); };
  for (const override of [{ apiKey: "" }, { sender: "" }, { sender: "TooLongSenderId" }]) {
    await assert.rejects(sendMnotifyCode("+233241234567", "123456", "verify", { ...options, ...override, fetcher }));
  }
  await assert.rejects(sendMnotifyCode("0241234567", "123456", "verify", { ...options, fetcher }));
});

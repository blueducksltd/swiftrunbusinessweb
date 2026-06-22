import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { category, subject, message, shopId, shopName, role, contactEmail } =
      await req.json() as {
        category: string;
        subject: string;
        message: string;
        shopId: string;
        shopName: string;
        role: string;
        contactEmail?: string;
      };

    if (!shopId || !subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { ok: false, reason: "Missing required fields" },
        { status: 400 },
      );
    }

    // 1) Persist the ticket so the admin portal can list it and raise a
    //    notification. external_id for the admin side is this doc id.
    const db = adminDb();
    const ref = await db.collection("supportTickets").add({
      shopId,
      shopName: shopName || "",
      role: role || "",
      category: category || "Other",
      subject: subject.trim(),
      message: message.trim(),
      contactEmail: contactEmail?.trim() || "",
      status: "open",
      source: "business-portal",
      isReadByAdmin: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2) Email a copy to the support inbox (best-effort; never blocks the
    //    ticket from being saved). Uses SUPPORT_EMAIL when set, otherwise the
    //    existing NOTIFY_EMAIL ops inbox.
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const inbox = process.env.SUPPORT_EMAIL ?? process.env.NOTIFY_EMAIL;

    if (smtpUser && smtpPass && inbox) {
      try {
        const smtpPort = Number(process.env.SMTP_PORT ?? 587);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? "smtp.gmail.com",
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `SwiftRun Business <${smtpUser}>`,
          to: inbox,
          replyTo: contactEmail?.trim() || undefined,
          subject: `[Business Support] ${subject.trim()}`,
          html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:#056abf;padding:20px 24px">
            <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.08em;text-transform:uppercase">SwiftRun Business · Support</p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff">${subject.trim()}</h1>
          </div>
          <div style="padding:24px">
            <table style="width:100%;font-size:13px;color:#475569;margin-bottom:16px">
              <tr><td style="padding:2px 0;font-weight:700;width:90px">Shop</td><td>${shopName || ""} <span style="color:#94a3b8">(${shopId})</span></td></tr>
              <tr><td style="padding:2px 0;font-weight:700">From</td><td>${role || "—"}${contactEmail?.trim() ? ` · ${contactEmail.trim()}` : ""}</td></tr>
              <tr><td style="padding:2px 0;font-weight:700">Category</td><td>${category || "Other"}</td></tr>
            </table>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-size:15px;color:#334155;white-space:pre-wrap">${message.trim().replace(/</g, "&lt;")}</div>
            <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">Ticket ${ref.id}${contactEmail?.trim() ? " · reply directly to this email to respond to the business." : ""}</p>
          </div>
        </div>`,
        });
      } catch {
        // Email failure must not fail the request — the ticket is already saved.
      }
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

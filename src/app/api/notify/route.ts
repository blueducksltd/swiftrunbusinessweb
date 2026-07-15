import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const COLORS: Record<string, string> = {
  order_new: "#056abf",
  order_delivered: "#16a34a",
  order_cancelled: "#dc2626",
  order_driver_arrived: "#7c3aed",
  stock_low: "#d97706",
  stock_out: "#dc2626",
  rating_new: "#ca8a04",
};

const ICONS: Record<string, string> = {
  order_new: "🛍️",
  order_delivered: "✅",
  order_cancelled: "❌",
  order_driver_arrived: "🚗",
  stock_low: "⚠️",
  stock_out: "🚫",
  rating_new: "⭐",
};

export async function POST(req: NextRequest) {
  try {
    const { type, title, subtitle, shopId } = await req.json() as {
      type: string;
      title: string;
      subtitle: string;
      shopId: string;
    };
    const access = await verifyBusinessShopAccess(req, shopId);
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const to = String(access.access.shop.email ?? access.access.shop.ownerEmail ?? process.env.NOTIFY_EMAIL ?? smtpUser ?? "").trim();

    if (!smtpUser || !smtpPass || !to) {
      return NextResponse.json({ ok: false, reason: "SMTP not configured" });
    }

    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const color = COLORS[type] ?? "#056abf";
    const icon = ICONS[type] ?? "🔔";

    await transporter.sendMail({
      from: `SwiftRun Business <${smtpUser}>`,
      to,
      subject: `${icon} ${title} — SwiftRun`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:${color};padding:20px 24px">
            <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.08em;text-transform:uppercase">SwiftRun Business</p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff">${icon} ${title}</h1>
          </div>
          <div style="padding:20px 24px">
            <p style="margin:0;font-size:15px;color:#334155;font-weight:600">${subtitle}</p>
            <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Log in to your SwiftRun business dashboard to view details and take action.</p>
          </div>
          <div style="padding:0 24px 20px">
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://business.swiftrunapp.com"}/dashboard"
               style="display:inline-block;background:${color};color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none">
              Open Dashboard
            </a>
          </div>
          <div style="padding:12px 24px;border-top:1px solid #f1f5f9;background:#f8fafc">
            <p style="margin:0;font-size:11px;color:#94a3b8">You are receiving this because you have a SwiftRun business account. &copy; SwiftRun</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify]", err);
    return NextResponse.json({ ok: false, reason: String(err) });
  }
}

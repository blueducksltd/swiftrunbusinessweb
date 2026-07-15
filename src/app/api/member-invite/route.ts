import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

export async function POST(req: NextRequest) {
  try {
    const { memberEmail, memberId, shopId, isResend } = await req.json() as {
      memberEmail: string;
      memberId?: string;
      shopId: string;
      isResend?: boolean;
    };
    const access = await verifyBusinessShopAccess(req, shopId, "owner");
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });
    const normalizedEmail = memberEmail.toLowerCase().trim();
    const members = access.access.shopRef.collection("members");
    const member = memberId
      ? await members.doc(memberId).get()
      : (await members.where("email", "==", normalizedEmail).limit(1).get()).docs[0];
    if (!member?.exists || String(member.data()?.email ?? "").toLowerCase().trim() !== normalizedEmail) {
      return NextResponse.json({ ok: false, reason: "Staff member not found for this shop" }, { status: 404 });
    }
    const memberData = member.data() ?? {};
    const memberName = `${memberData.firstName ?? ""} ${memberData.lastName ?? ""}`.trim() || normalizedEmail;
    const shopName = String(access.access.shop.name ?? "Your shop");
    const role = String(memberData.role ?? "Staff");

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass || !normalizedEmail) {
      return NextResponse.json({ ok: false, reason: "SMTP not configured or missing email" });
    }

    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://business.swiftrunapp.com";
    const subject = isResend
      ? `Reminder: You've been invited to join ${shopName} on SwiftRun`
      : `You've been invited to join ${shopName} on SwiftRun`;

    await transporter.sendMail({
      from: `SwiftRun Business <${smtpUser}>`,
      to: normalizedEmail,
      subject,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:#056abf;padding:20px 24px">
            <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.08em;text-transform:uppercase">SwiftRun Business</p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff">👋 You're invited!</h1>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 16px;font-size:15px;color:#334155">
              Hi <strong>${memberName}</strong>,
            </p>
            <p style="margin:0 0 16px;font-size:15px;color:#334155">
              You've been added to <strong>${shopName}</strong> as a <strong>${role}</strong> on the SwiftRun Business platform.
            </p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b">
              Sign in with this email address to access your dashboard, manage orders, and more.
            </p>
            <a href="${portalUrl}/login"
               style="display:inline-block;background:#056abf;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
              Sign in to SwiftRun Business
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
              If you don't have an account yet, use this email address to sign up at the link above.
            </p>
          </div>
          <div style="padding:12px 24px;border-top:1px solid #f1f5f9;background:#f8fafc">
            <p style="margin:0;font-size:11px;color:#94a3b8">You received this because ${shopName} added you to their SwiftRun team. &copy; SwiftRun</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[member-invite]", err);
    return NextResponse.json({ ok: false, reason: String(err) });
  }
}

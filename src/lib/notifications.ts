import nodemailer from "nodemailer";

// Types
export type NotificationType = "email" | "slack" | "discord" | "custom";

export type NotificationEvent =
  | "video.completed"
  | "video.failed"
  | "video.processing"
  | "video.pending";

export interface NotificationPayload {
  event: NotificationEvent;
  videoId: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  userId: string;
  reviewerName?: string;
  businessName?: string;
  errorMessage?: string;
  timestamp: Date;
}

export interface NotificationConfig {
  type: NotificationType;
  webhookUrl?: string;
  email?: {
    to: string;
    from?: string;
  };
}

// Email Configuration
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

const getEmailConfig = (): EmailConfig | null => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  };
};

// Email Notification
export async function sendEmailNotification(
  payload: NotificationPayload,
  to: string,
  from?: string
): Promise<boolean> {
  const emailConfig = getEmailConfig();

  if (!emailConfig) {
    console.warn("Email notification skipped: SMTP not configured");
    return false;
  }

  const transporter = nodemailer.createTransport(emailConfig);

  const subject = getEmailSubject(payload);
  const html = getEmailHtml(payload);

  try {
    await transporter.sendMail({
      from: from || process.env.SMTP_FROM || emailConfig.auth.user,
      to,
      subject,
      html,
    });
    console.log(`Email notification sent to ${to} for event ${payload.event}`);
    return true;
  } catch (error) {
    console.error("Failed to send email notification:", error);
    return false;
  }
}

function getEmailSubject(payload: NotificationPayload): string {
  switch (payload.event) {
    case "video.completed":
      return `Your video is ready! - ${payload.businessName || "Komendly"}`;
    case "video.failed":
      return `Video generation failed - ${payload.businessName || "Komendly"}`;
    case "video.processing":
      return `Video is being processed - ${payload.businessName || "Komendly"}`;
    case "video.pending":
      return `Video generation queued - ${payload.businessName || "Komendly"}`;
    default:
      return `Video Status Update - ${payload.businessName || "Komendly"}`;
  }
}

function getEmailHtml(payload: NotificationPayload): string {
  const baseStyles = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  `;

  const buttonStyles = `
    display: inline-block;
    background-color: #6366f1;
    color: white;
    padding: 12px 24px;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    margin-top: 16px;
  `;

  switch (payload.event) {
    case "video.completed":
      return `
        <div style="${baseStyles}">
          <h1 style="color: #10b981;">Your Video is Ready!</h1>
          <p>Great news! Your testimonial video for <strong>${payload.businessName || "your business"}</strong> has been generated successfully.</p>
          ${payload.reviewerName ? `<p>Reviewer: <strong>${payload.reviewerName}</strong></p>` : ""}
          ${payload.thumbnailUrl ? `<img src="${payload.thumbnailUrl}" alt="Video Thumbnail" style="max-width: 100%; border-radius: 8px; margin: 16px 0;" />` : ""}
          ${payload.videoUrl ? `<a href="${payload.videoUrl}" style="${buttonStyles}">View Your Video</a>` : ""}
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Video ID: ${payload.videoId}</p>
        </div>
      `;

    case "video.failed":
      return `
        <div style="${baseStyles}">
          <h1 style="color: #ef4444;">Video Generation Failed</h1>
          <p>Unfortunately, we encountered an issue while generating your testimonial video for <strong>${payload.businessName || "your business"}</strong>.</p>
          ${payload.errorMessage ? `<p style="background: #fef2f2; padding: 12px; border-radius: 6px; color: #991b1b;">Error: ${payload.errorMessage}</p>` : ""}
          <p>Please try again or contact support if the issue persists.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Video ID: ${payload.videoId}</p>
        </div>
      `;

    case "video.processing":
      return `
        <div style="${baseStyles}">
          <h1 style="color: #f59e0b;">Video is Processing</h1>
          <p>Your testimonial video for <strong>${payload.businessName || "your business"}</strong> is currently being generated.</p>
          <p>This usually takes a few minutes. We'll notify you when it's ready!</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Video ID: ${payload.videoId}</p>
        </div>
      `;

    default:
      return `
        <div style="${baseStyles}">
          <h1>Video Status Update</h1>
          <p>Status: <strong>${payload.event}</strong></p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Video ID: ${payload.videoId}</p>
        </div>
      `;
  }
}

// Slack Notification
export async function sendSlackNotification(
  payload: NotificationPayload,
  webhookUrl: string
): Promise<boolean> {
  const message = buildSlackMessage(payload);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }

    console.log(`Slack notification sent for event ${payload.event}`);
    return true;
  } catch (error) {
    console.error("Failed to send Slack notification:", error);
    return false;
  }
}

function buildSlackMessage(payload: NotificationPayload): object {
  const statusEmoji = getStatusEmoji(payload.event);
  const statusColor = getStatusColor(payload.event);
  const statusText = getStatusText(payload.event);

  const blocks: object[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${statusEmoji} ${statusText}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Video ID:*\n${payload.videoId}`,
        },
        {
          type: "mrkdwn",
          text: `*Status:*\n${payload.event.replace("video.", "")}`,
        },
      ],
    },
  ];

  if (payload.businessName || payload.reviewerName) {
    blocks.push({
      type: "section",
      fields: [
        ...(payload.businessName
          ? [{ type: "mrkdwn", text: `*Business:*\n${payload.businessName}` }]
          : []),
        ...(payload.reviewerName
          ? [{ type: "mrkdwn", text: `*Reviewer:*\n${payload.reviewerName}` }]
          : []),
      ],
    });
  }

  if (payload.event === "video.completed" && payload.videoUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${payload.videoUrl}|View Video>`,
      },
    });
  }

  if (payload.event === "video.failed" && payload.errorMessage) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error:* ${payload.errorMessage}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Timestamp: ${payload.timestamp.toISOString()}`,
      },
    ],
  });

  return {
    text: `${statusEmoji} ${statusText}`,
    attachments: [
      {
        color: statusColor,
        blocks,
      },
    ],
  };
}

// Discord Notification
export async function sendDiscordNotification(
  payload: NotificationPayload,
  webhookUrl: string
): Promise<boolean> {
  const embed = buildDiscordEmbed(payload);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook returned ${response.status}`);
    }

    console.log(`Discord notification sent for event ${payload.event}`);
    return true;
  } catch (error) {
    console.error("Failed to send Discord notification:", error);
    return false;
  }
}

function buildDiscordEmbed(payload: NotificationPayload): object {
  const statusEmoji = getStatusEmoji(payload.event);
  const statusColor = getDiscordColor(payload.event);
  const statusText = getStatusText(payload.event);

  const fields: object[] = [
    {
      name: "Video ID",
      value: payload.videoId,
      inline: true,
    },
    {
      name: "Status",
      value: payload.event.replace("video.", ""),
      inline: true,
    },
  ];

  if (payload.businessName) {
    fields.push({
      name: "Business",
      value: payload.businessName,
      inline: true,
    });
  }

  if (payload.reviewerName) {
    fields.push({
      name: "Reviewer",
      value: payload.reviewerName,
      inline: true,
    });
  }

  if (payload.event === "video.failed" && payload.errorMessage) {
    fields.push({
      name: "Error",
      value: payload.errorMessage,
      inline: false,
    });
  }

  const embed: Record<string, unknown> = {
    title: `${statusEmoji} ${statusText}`,
    color: statusColor,
    fields,
    timestamp: payload.timestamp.toISOString(),
    footer: {
      text: "Komendly Video Generation",
    },
  };

  if (payload.event === "video.completed" && payload.videoUrl) {
    embed.url = payload.videoUrl;
  }

  if (payload.thumbnailUrl) {
    embed.thumbnail = { url: payload.thumbnailUrl };
  }

  return embed;
}

// Custom Webhook Notification
export async function sendCustomWebhookNotification(
  payload: NotificationPayload,
  webhookUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Komendly-Event": payload.event,
        "X-Komendly-Timestamp": payload.timestamp.toISOString(),
      },
      body: JSON.stringify({
        event: payload.event,
        data: {
          videoId: payload.videoId,
          videoUrl: payload.videoUrl,
          thumbnailUrl: payload.thumbnailUrl,
          userId: payload.userId,
          reviewerName: payload.reviewerName,
          businessName: payload.businessName,
          errorMessage: payload.errorMessage,
        },
        timestamp: payload.timestamp.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom webhook returned ${response.status}`);
    }

    console.log(`Custom webhook notification sent for event ${payload.event}`);
    return true;
  } catch (error) {
    console.error("Failed to send custom webhook notification:", error);
    return false;
  }
}

// Unified Notification Function
export async function sendNotification(
  payload: NotificationPayload,
  config: NotificationConfig
): Promise<boolean> {
  switch (config.type) {
    case "email":
      if (!config.email?.to) {
        console.error("Email notification requires 'to' address");
        return false;
      }
      return sendEmailNotification(payload, config.email.to, config.email.from);

    case "slack":
      if (!config.webhookUrl) {
        console.error("Slack notification requires webhookUrl");
        return false;
      }
      return sendSlackNotification(payload, config.webhookUrl);

    case "discord":
      if (!config.webhookUrl) {
        console.error("Discord notification requires webhookUrl");
        return false;
      }
      return sendDiscordNotification(payload, config.webhookUrl);

    case "custom":
      if (!config.webhookUrl) {
        console.error("Custom webhook requires webhookUrl");
        return false;
      }
      return sendCustomWebhookNotification(payload, config.webhookUrl);

    default:
      console.error(`Unknown notification type: ${config.type}`);
      return false;
  }
}

// Send notifications to multiple endpoints
export async function sendNotifications(
  payload: NotificationPayload,
  configs: NotificationConfig[]
): Promise<{ success: number; failed: number; results: boolean[] }> {
  const results = await Promise.all(
    configs.map((config) => sendNotification(payload, config))
  );

  return {
    success: results.filter(Boolean).length,
    failed: results.filter((r) => !r).length,
    results,
  };
}

// Helper functions
function getStatusEmoji(event: NotificationEvent): string {
  switch (event) {
    case "video.completed":
      return ":white_check_mark:";
    case "video.failed":
      return ":x:";
    case "video.processing":
      return ":hourglass_flowing_sand:";
    case "video.pending":
      return ":clock3:";
    default:
      return ":bell:";
  }
}

function getStatusColor(event: NotificationEvent): string {
  switch (event) {
    case "video.completed":
      return "#10b981"; // green
    case "video.failed":
      return "#ef4444"; // red
    case "video.processing":
      return "#f59e0b"; // yellow
    case "video.pending":
      return "#6366f1"; // indigo
    default:
      return "#6b7280"; // gray
  }
}

function getDiscordColor(event: NotificationEvent): number {
  switch (event) {
    case "video.completed":
      return 0x10b981; // green
    case "video.failed":
      return 0xef4444; // red
    case "video.processing":
      return 0xf59e0b; // yellow
    case "video.pending":
      return 0x6366f1; // indigo
    default:
      return 0x6b7280; // gray
  }
}

function getStatusText(event: NotificationEvent): string {
  switch (event) {
    case "video.completed":
      return "Video Generation Completed";
    case "video.failed":
      return "Video Generation Failed";
    case "video.processing":
      return "Video is Processing";
    case "video.pending":
      return "Video Generation Queued";
    default:
      return "Video Status Update";
  }
}

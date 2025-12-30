import bizSdk from "facebook-nodejs-business-sdk";
import crypto from "crypto";

const {
  Content,
  CustomData,
  EventRequest,
  UserData,
  ServerEvent,
  FacebookAdsApi,
} = bizSdk;

// Initialize with environment variables
const ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN!;
const PIXEL_ID = process.env.FACEBOOK_PIXEL_ID!;

// Initialize the Facebook API
if (ACCESS_TOKEN) {
  FacebookAdsApi.init(ACCESS_TOKEN);
}

export interface FacebookEventData {
  eventName: "Purchase" | "Lead" | "CompleteRegistration" | "Subscribe" | "InitiateCheckout" | "ViewContent" | string;
  eventId?: string;
  sourceUrl?: string;

  // User data for matching
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;

  // Client data
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string; // Facebook click ID from _fbc cookie
  fbp?: string; // Facebook browser ID from _fbp cookie

  // Purchase/transaction data
  value?: number;
  currency?: string;

  // Content data
  contentIds?: string[];
  contentName?: string;
  contentCategory?: string;
  numItems?: number;
}

/**
 * Hash a value using SHA256 for Facebook CAPI
 * Facebook requires certain user data to be hashed
 */
function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

/**
 * Send a server-side event to Facebook Conversions API
 */
export async function sendFacebookEvent(data: FacebookEventData): Promise<{ success: boolean; eventId?: string; error?: string }> {
  if (!ACCESS_TOKEN || !PIXEL_ID) {
    console.warn("Facebook CAPI not configured: missing ACCESS_TOKEN or PIXEL_ID");
    return { success: false, error: "Facebook CAPI not configured" };
  }

  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Build UserData
    const userData = new UserData();

    if (data.email) {
      userData.setEmail(hashValue(data.email));
    }
    if (data.phone) {
      userData.setPhone(hashValue(data.phone));
    }
    if (data.firstName) {
      userData.setFirstName(hashValue(data.firstName));
    }
    if (data.lastName) {
      userData.setLastName(hashValue(data.lastName));
    }
    if (data.city) {
      userData.setCity(hashValue(data.city));
    }
    if (data.state) {
      userData.setState(hashValue(data.state));
    }
    if (data.country) {
      userData.setCountry(hashValue(data.country));
    }
    if (data.zipCode) {
      userData.setZip(hashValue(data.zipCode));
    }
    if (data.clientIpAddress) {
      userData.setClientIpAddress(data.clientIpAddress);
    }
    if (data.clientUserAgent) {
      userData.setClientUserAgent(data.clientUserAgent);
    }
    if (data.fbc) {
      userData.setFbc(data.fbc);
    }
    if (data.fbp) {
      userData.setFbp(data.fbp);
    }

    // Build CustomData for purchases/transactions
    const customData = new CustomData();

    if (data.value !== undefined) {
      customData.setValue(data.value);
    }
    if (data.currency) {
      customData.setCurrency(data.currency);
    }
    if (data.contentIds && data.contentIds.length > 0) {
      const contents = data.contentIds.map((id) => {
        return new Content()
          .setId(id)
          .setQuantity(1);
      });
      customData.setContents(contents);
      customData.setContentIds(data.contentIds);
    }
    if (data.contentName) {
      customData.setContentName(data.contentName);
    }
    if (data.contentCategory) {
      customData.setContentCategory(data.contentCategory);
    }
    if (data.numItems) {
      customData.setNumItems(data.numItems);
    }

    // Generate event ID for deduplication if not provided
    const eventId = data.eventId || `${data.eventName}_${currentTimestamp}_${Math.random().toString(36).substring(7)}`;

    // Build ServerEvent
    const serverEvent = new ServerEvent()
      .setEventName(data.eventName)
      .setEventTime(currentTimestamp)
      .setEventId(eventId)
      .setUserData(userData)
      .setCustomData(customData)
      .setActionSource("website");

    if (data.sourceUrl) {
      serverEvent.setEventSourceUrl(data.sourceUrl);
    }

    // Create and send EventRequest
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
      .setEvents([serverEvent]);

    // Send the event
    const response = await eventRequest.execute();

    console.log("Facebook CAPI event sent successfully:", {
      eventName: data.eventName,
      eventId,
      eventsReceived: response?.events_received,
    });

    return {
      success: true,
      eventId,
    };
  } catch (error) {
    console.error("Facebook CAPI error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a Purchase event to Facebook
 */
export async function sendPurchaseEvent(params: {
  email: string;
  value: number;
  currency?: string;
  transactionId: string;
  contentName?: string;
  sourceUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendFacebookEvent({
    eventName: "Purchase",
    eventId: params.transactionId,
    email: params.email,
    value: params.value,
    currency: params.currency || "USD",
    contentName: params.contentName,
    sourceUrl: params.sourceUrl,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
    fbc: params.fbc,
    fbp: params.fbp,
    contentIds: [params.transactionId],
    numItems: 1,
  });
}

/**
 * Send a Lead event to Facebook
 */
export async function sendLeadEvent(params: {
  email: string;
  sourceUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendFacebookEvent({
    eventName: "Lead",
    email: params.email,
    sourceUrl: params.sourceUrl,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
    fbc: params.fbc,
    fbp: params.fbp,
  });
}

/**
 * Send a Subscribe event to Facebook
 */
export async function sendSubscribeEvent(params: {
  email: string;
  value: number;
  currency?: string;
  planName: string;
  transactionId: string;
  sourceUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbc?: string;
  fbp?: string;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
  return sendFacebookEvent({
    eventName: "Subscribe",
    eventId: params.transactionId,
    email: params.email,
    value: params.value,
    currency: params.currency || "USD",
    contentName: params.planName,
    sourceUrl: params.sourceUrl,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
    fbc: params.fbc,
    fbp: params.fbp,
  });
}

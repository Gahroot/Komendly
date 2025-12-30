declare module "facebook-nodejs-business-sdk" {
  export class Content {
    setId(id: string): Content;
    setQuantity(quantity: number): Content;
    setItemPrice(price: number): Content;
    setTitle(title: string): Content;
    setDescription(description: string): Content;
    setBrand(brand: string): Content;
    setCategory(category: string): Content;
  }

  export class CustomData {
    setValue(value: number): CustomData;
    setCurrency(currency: string): CustomData;
    setContents(contents: Content[]): CustomData;
    setContentIds(contentIds: string[]): CustomData;
    setContentName(contentName: string): CustomData;
    setContentCategory(contentCategory: string): CustomData;
    setContentType(contentType: string): CustomData;
    setNumItems(numItems: number): CustomData;
    setOrderId(orderId: string): CustomData;
    setSearchString(searchString: string): CustomData;
    setStatus(status: string): CustomData;
  }

  export class UserData {
    setEmail(email: string): UserData;
    setPhone(phone: string): UserData;
    setFirstName(firstName: string): UserData;
    setLastName(lastName: string): UserData;
    setCity(city: string): UserData;
    setState(state: string): UserData;
    setCountry(country: string): UserData;
    setZip(zip: string): UserData;
    setExternalId(externalId: string): UserData;
    setClientIpAddress(ipAddress: string): UserData;
    setClientUserAgent(userAgent: string): UserData;
    setFbc(fbc: string): UserData;
    setFbp(fbp: string): UserData;
    setSubscriptionId(subscriptionId: string): UserData;
    setFbLoginId(fbLoginId: string): UserData;
    setLeadId(leadId: string): UserData;
    setDobd(dobd: string): UserData;
    setDobm(dobm: string): UserData;
    setDoby(doby: string): UserData;
    setGender(gender: string): UserData;
  }

  export class ServerEvent {
    setEventName(eventName: string): ServerEvent;
    setEventTime(eventTime: number): ServerEvent;
    setEventId(eventId: string): ServerEvent;
    setEventSourceUrl(eventSourceUrl: string): ServerEvent;
    setUserData(userData: UserData): ServerEvent;
    setCustomData(customData: CustomData): ServerEvent;
    setActionSource(actionSource: string): ServerEvent;
    setOptOut(optOut: boolean): ServerEvent;
    setDataProcessingOptions(options: string[]): ServerEvent;
    setDataProcessingOptionsCountry(country: number): ServerEvent;
    setDataProcessingOptionsState(state: number): ServerEvent;
  }

  export class EventRequest {
    constructor(accessToken: string, pixelId: string);
    setEvents(events: ServerEvent[]): EventRequest;
    setTestEventCode(testEventCode: string): EventRequest;
    setPartnerAgent(partnerAgent: string): EventRequest;
    execute(): Promise<EventResponse>;
  }

  export interface EventResponse {
    events_received: number;
    messages: string[];
    fbtrace_id: string;
  }

  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
  }

  export const DeliveryCategory: {
    HOME_DELIVERY: string;
    CURBSIDE: string;
    IN_STORE: string;
  };

  const bizSdk: {
    Content: typeof Content;
    CustomData: typeof CustomData;
    UserData: typeof UserData;
    ServerEvent: typeof ServerEvent;
    EventRequest: typeof EventRequest;
    FacebookAdsApi: typeof FacebookAdsApi;
    DeliveryCategory: typeof DeliveryCategory;
  };

  export default bizSdk;
}

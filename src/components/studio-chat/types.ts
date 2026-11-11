import type { RenderView, StudioAccountView, ThreadEvent, ThreadMessage, UploadView } from "@/lib/studio/thread";

export interface SessionSummary {
  id: string;
  title: string;
  status: string;
  freeVideo: boolean;
  lastActivityAt: string;
  archived: boolean;
}

export interface ThreadData {
  session: SessionSummary;
  messages: ThreadMessage[];
  renders: RenderView[];
  uploads: UploadView[];
  events: ThreadEvent[];
  lastEventId: string;
  account: StudioAccountView;
}

export interface Paywall {
  code: string;
  neededCredits: number;
}

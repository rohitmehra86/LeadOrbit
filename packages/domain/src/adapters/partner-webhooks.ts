/**
 * Partner webhook delivery adapter.
 * Thin wrapper around domain helpers for Wave 6 ecosystem surfaces.
 */

export {
  PARTNER_EVENT_CATALOG,
  applyOutboundDeliveryAttempt,
  buildOutboundWebhookEnvelope,
  isPartnerEventType,
  normalizeEventTypes,
  partnerDeliveryRetryDelayMs,
  postSignedOutboundWebhook,
  validateOutboundTargetUrl,
  type InboundPartnerEvent,
  type OutboundHttpResult,
  type OutboundWebhookDelivery,
  type OutboundWebhookSubscription,
  type PartnerEventType,
} from "../partner-webhooks";

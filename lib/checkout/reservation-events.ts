export type ReservationEventData = {
  pendingCheckoutToken: string;
  reservationToken: string;
  stripeSessionId: string;
};

export type ReservationReleaseReason = "stripe_session_expired" | "async_payment_failed";

export type ReservationEventResult = {
  changed: boolean;
};

export type ReservationEventWriter = {
  markAwaitingPayment: (session: ReservationEventData) => Promise<ReservationEventResult>;
  releaseReservation: (
    session: ReservationEventData,
    reason: ReservationReleaseReason,
  ) => Promise<ReservationEventResult>;
};

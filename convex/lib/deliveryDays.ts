export const DELIVERY_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

export type DeliveryDay = typeof DELIVERY_DAYS[number];

/** Legacy schedules without a snapshot retain the original seven-day behavior. */
export function deliveryDaysForSchedule(schedule: { deliveryDays?: DeliveryDay[] }): DeliveryDay[] {
  return schedule.deliveryDays?.length ? schedule.deliveryDays : [...DELIVERY_DAYS];
}

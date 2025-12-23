export type ListServiceOrdersQuery = {
  q?: string;
  status?: string;
  type?: string;
  technicianId?: string;
  start?: string; // ISO
  end?: string;   // ISO
  page?: string | number;
  size?: string | number
  scheduledOnly?: string | number;
};

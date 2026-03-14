export type ListServiceOrdersQuery = {
  q?: string;
  status?: string | string[];
  type?: string | string[];
  commercialStatus?: string | string[];
  technicianId?: string | string[];
  hasIssue?: string | number;
  issueStatus?: string | string[];
  unresolvedIssueOnly?: string | number;
  start?: string; // ISO
  end?: string;   // ISO
  page?: string | number;
  size?: string | number
  scheduledOnly?: string | number;
  unscheduledOnly?: string | number;
};

export type ListServiceOrderIssuesQuery = {
  q?: string;
  status?: string | string[];
  ownerUserId?: string | string[];
  openOnly?: string | number;
  page?: string | number;
  size?: string | number;
};

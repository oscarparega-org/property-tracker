export type HealthResponse = {
  status: 'ok';
  database: 'connected';
  timestamp: string;
};

export type ProtectedResponse = {
  message: string;
  user: { id: string; name: string; email: string };
};

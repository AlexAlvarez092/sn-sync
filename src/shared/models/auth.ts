export interface SnAuthInput {
  instanceName: string;
  instanceUrl: string;
  username: string;
  password: string;
}

export interface SnAuthSecret {
  instanceUrl: string;
  username: string;
  password: string;
}

export interface SavedSnAuth extends SnAuthSecret {
  instanceName: string;
}

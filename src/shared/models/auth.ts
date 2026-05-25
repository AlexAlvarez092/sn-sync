export interface SnAuthInput {
  instanceName: string;
  instanceUrl: string;
  username: string;
  password: string;
}

export interface SnAuthSecret {
  instanceUrl: string;
  username?: string;
  password?: string;
  bearer?: string;
  userToken?: string;
  cookie?: string;
}

export interface SavedSnAuth extends SnAuthSecret {
  instanceName: string;
}

declare module 'express-mysql-session' {
  import session from 'express-session';
  import { PoolOptions } from 'mysql2';

  interface Options extends Partial<PoolOptions> {
    createDatabaseTable?: boolean;
    schema?: {
      tableName?: string;
      columnNames?: {
        session_id?: string;
        expires?: string;
        data?: string;
      };
    };
    clearExpired?: boolean;
    checkExpirationInterval?: number;
    expiration?: number;
  }

  interface MySQLStoreConstructor {
    new (options: Options): session.Store;
    onReady(): Promise<void>;
  }

  function MySQLStore(session: typeof import('express-session')): MySQLStoreConstructor;

  export = MySQLStore;
}

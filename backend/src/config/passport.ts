import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { webPool } from './database';
import { RowDataPacket } from 'mysql2';

interface SteamProfile {
  id?: string;
  displayName?: string;
  photos?: { value: string }[];
  _json?: {
    steamid?: string;
    personaname?: string;
    avatarfull?: string;
    avatar?: string;
    avatarmedium?: string;
  };
}

interface User {
  id: number;
  steamid: string;
  username: string;
  avatar: string;
  created_at: Date;
}

export const configurePassport = () => {
  passport.serializeUser((user: any, done) => {
    done(null, user.steamid);
  });

  passport.deserializeUser(async (steamid: string, done) => {
    try {
      const [rows] = await webPool.query<RowDataPacket[]>(
        'SELECT * FROM users WHERE steamid = ?',
        [steamid]
      );
      const user = rows[0] ? (rows[0] as unknown as User) : null;
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  passport.use(
    new SteamStrategy(
      {
        returnURL: process.env.STEAM_RETURN_URL || 'http://localhost:5000/api/auth/steam/return',
        realm: process.env.STEAM_REALM || 'http://localhost:5000',
        apiKey: process.env.STEAM_API_KEY || '',
      },
      async (identifier: string, profile: any, done: any) => {
        try {
          // Extract Steam ID from identifier URL
          // identifier format: https://steamcommunity.com/openid/id/76561198095544780
          const steamid = identifier.split('/').pop() || profile.id || profile._json?.steamid;
          const username = profile.displayName || profile._json?.personaname || 'Unknown';
          const avatar = profile.photos?.[2]?.value || profile.photos?.[0]?.value || profile._json?.avatarfull || '';

          // Validate steamid
          if (!steamid) {
            console.error('Steam auth failed: Steam ID not found in response');
            return done(new Error('Steam ID не найден'), null);
          }

          // Check if user exists
          const [rows] = await webPool.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE steamid = ?',
            [steamid]
          );

          let user: User;

          if (rows.length > 0) {
            // Update existing user
            await webPool.query(
              'UPDATE users SET username = ?, avatar = ?, last_login = NOW() WHERE steamid = ?',
              [username, avatar, steamid]
            );
            user = rows[0] as User;
            user.username = username;
            user.avatar = avatar;
          } else {
            // Create new user
            const [result] = await webPool.query(
              'INSERT INTO users (steamid, username, avatar, created_at, last_login) VALUES (?, ?, ?, NOW(), NOW())',
              [steamid, username, avatar]
            );
            user = {
              id: (result as any).insertId,
              steamid,
              username,
              avatar,
              created_at: new Date(),
            };
          }

          done(null, user);
        } catch (error) {
          done(error, null);
        }
      }
    )
  );
};

import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Steam authentication
router.get('/steam', passport.authenticate('steam'));

// Steam return URL
router.get(
  '/steam/return',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/`);
  }
);

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, steamid, username, avatar } = req.user as any;
    res.json({ user: { id, steamid, username, avatar } });
  } else {
    res.json({ user: null });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;

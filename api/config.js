import { publicConfiguration } from '../lib/config.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'GET only'});
  res.status(200).json(publicConfiguration());
}

# লাইভ ডেপ্লয়মেন্ট গাইড (Deployment Guide)

যেহেতু আপনি GitHub, Vercel এবং Turso একাউন্ট খুলে ফেলেছেন, এখন আমরা আমাদের প্রজেক্টটি লাইভ করব। আপনার কম্পিউটারে আমি পুরো কোড রেডি করে `git`-এ কমিট করে রেখেছি। এখন শুধু নিচের ধাপগুলো হুবহু ফলো করুন:

## ধাপ ১: GitHub-এ কোড আপলোড করা
1. আপনার GitHub একাউন্টে লগিন করে **New Repository** বাটনে ক্লিক করুন। 
2. Repository Name দিন: `rangdhanu-duet`
3. "Public" বা "Private" সিলেক্ট করে **Create repository**-তে ক্লিক করুন।
4. এরপর আপনার কম্পিউটারে (যেখানে কোড আছে, `D:\Rangdhanu Turso` ফোল্ডারে) নিচের কমান্ডগুলো টার্মিনালে/PowerShell-এ একটা একটা করে রান করুন:

```powershell
git remote add origin https://github.com/Razoyan360/rangdhanu-duet.git
git branch -M main
git push -u origin main
```
*(GitHub পাসওয়ার্ড বা অথেনটিকেশন চাইলে সেটা দিয়ে দিন)*

## ধাপ ২: Turso-তে ডাটাবেস আপলোড করা
যেহেতু আমাদের কম্পিউটারে `local.db` নামের একটি ডাটাবেস তৈরি হয়ে আছে (যেখানে সব ডাটা আছে), আমরা সরাসরি সেটা Turso-তে আপলোড করব।
আপনার PowerShell-এ নিচের কমান্ডটি রান করে Turso CLI ইন্সটল করুন:
```powershell
iwr https://get.turso.tech/install.ps1 -useb | iex
```
ইন্সটল হয়ে গেলে টার্মিনালটা ক্লোজ করে আবার নতুন করে ওপেন করুন এবং ফোল্ডারে (`D:\Rangdhanu Turso`) যান। এরপর:

1. **লগিন করুন:** `turso auth login` (এটি ব্রাউজার ওপেন করবে, সেখানে পারমিশন দিন)
2. **ডাটাবেস তৈরি করুন:** 
```powershell
turso db create rangdhanu-db --from-file backend/local.db
```
3. **ডাটাবেসের URL বের করুন:**
```powershell
turso db show rangdhanu-db --url
```
*(যে লিংকটা আসবে, যেমন: `libsql://rangdhanu-db-...` সেটা কপি করে কোথাও সেভ রাখুন)*
4. **Auth Token বের করুন:**
```powershell
turso db tokens create rangdhanu-db
```
*(যে বড় টোকেনটা আসবে, সেটাও কপি করে সেভ রাখুন)*

## ধাপ ৩: Vercel-এ Backend ডেপ্লয় করা
1. [Vercel Dashboard](https://vercel.com/dashboard)-এ যান এবং **Add New... -> Project**-এ ক্লিক করুন।
2. আপনার GitHub একাউন্ট কানেক্ট করে `rangdhanu-duet` রিপোজিটরিটি **Import** করুন।
3. **"Root Directory"** অপশনে `Edit` ক্লিক করে `backend` সিলেক্ট করুন।
4. **Environment Variables** অপশনে ক্লিক করে নিচের ৪টি ভেরিয়েবল বসান:
   - Name: `TURSO_DATABASE_URL` , Value: *(ধাপ ২-এ পাওয়া URL)*
   - Name: `TURSO_AUTH_TOKEN` , Value: *(ধাপ ২-এ পাওয়া টোকেন)*
   - Name: `SMTP_USER` , Value: `rangdhanuduet@gmail.com`
   - Name: `SMTP_PASS` , Value: `mhol wsgu biaf zgtd`
5. এবার **Deploy** বাটনে ক্লিক করুন!
6. ডেপ্লয় শেষ হলে Vercel আপনাকে একটা লিংক দেবে (যেমন: `https://rangdhanu-duet.vercel.app`)। লিংকটা কপি করুন।

## ধাপ ৪: Frontend কানেক্ট করে ডেপ্লয় করা
1. আপনার কম্পিউটারের কোডে `D:\Rangdhanu Turso\frontend\script.js` ফাইলটি ওপেন করুন।
2. ফাইলের একদম উপরে `const API_BASE_URL = 'http://localhost:3000/api';` লেখা আছে। 
   সেখানে `http://localhost:3000`-এর জায়গায় আপনার Vercel-এর Backend লিংকটি বসিয়ে দিন।
   *(উদাহরণ: `const API_BASE_URL = 'https://rangdhanu-duet.vercel.app/api';`)*
3. ফাইল সেভ করে আবার গিটহাবে পুশ করুন:
```powershell
git add .
git commit -m "Update API URL"
git push
```
4. এরপর আবার Vercel Dashboard-এ গিয়ে **Add New Project**-এ ক্লিক করে একই `rangdhanu-duet` রিপোজিটরি **Import** করুন।
5. এবার **"Root Directory"** হিসেবে `frontend` সিলেক্ট করুন।
6. **Deploy** বাটনে ক্লিক করুন!

ব্যস! আপনার ওয়েবসাইট লাইভ! 🎉 Vercel-এর ফ্রন্টএন্ড লিংকটিতে গেলেই ওয়েবসাইট দেখতে পাবেন!

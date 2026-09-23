# PromptCHAT

Live chat สำหรับฝังบนเว็บไซต์อื่น พร้อมกล่องข้อความสำหรับทีมงาน สร้างด้วย Next.js 16, React 19 และ Supabase

## พัฒนาบนเครื่อง

ใช้ Node.js 26 แล้วรัน `npm install` และ `npm run dev` เปิด `http://localhost:3000` บัญชี `root` / `root` ใช้ได้เฉพาะ localhost เพื่อดูหน้าจอและทดสอบข้อมูลในเบราว์เซอร์ ไม่ใช่บัญชี production

ไฟล์ `scripts/with-local-env.mjs` จะอ่านค่า public Supabase URL/key จากไฟล์ส่วนตัวใน Documents ถ้ามี โดยไม่คัดลอก secret เข้า repository สำหรับ production ตั้ง `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน Vercel ส่วน `service_role` และ database password ห้ามใส่ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_`

## Supabase และ Vercel

เปิด Anonymous Sign-in และอีเมลใน Supabase Auth จากนั้นรัน migration ใน `supabase/migrations/0001_promptchat.sql` ตรวจ RLS, Storage และ Realtime ก่อนเปิดใช้งานจริง ตั้งค่า env สองตัวข้างบนใน Vercel แล้ว deploy จาก GitHub

## ฝังบนเว็บลูกค้า

คัดลอก script จากหน้า “ติดตั้งบนเว็บไซต์” หลังสร้าง workspace และยืนยันโดเมน เลือกปุ่มแชตเริ่มต้น หรือเลือก “ใช้ปุ่มของเว็บไซต์ฉัน” เพื่อซ่อนปุ่ม PromptCHAT แล้วสั่งเปิดผ่าน `window.PromptChatWidget.open()` ปิดด้วย `close()` หรือสลับด้วย `toggle()`

## การตรวจสอบ

`npm run lint` และ `npm run build`

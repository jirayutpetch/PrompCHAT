# คู่มือติดตั้ง PrompCHAT

## 1. สร้าง workspace

สมัคร/เข้าสู่ระบบที่ https://prompchat.vercel.app/ แล้วสร้าง workspace โดยระบุชื่อแบรนด์และโดเมนเว็บไซต์ (ไม่ต้องใส่ `https://` หรือ path) 1 workspace ต่อ 1 hostname สูงสุด 5 เว็บไซต์ต่อบัญชี

## 2. คัดลอกโค้ดจากแอป

เปิดเมนู **ติดตั้งบนเว็บไซต์** แล้วใช้ปุ่ม **คัดลอกโค้ดติดตั้ง** อย่าคัดลอกจากตัวอย่างที่ถูกครอบด้วย Markdown หรือแปลงอักขระ HTML

## 3. วางสคริปต์

- HTML: วางโค้ดก่อน `</body>` แล้วเผยแพร่หน้าเว็บ
- WordPress: วางใน Footer / Custom Code ของธีมหรือปลั๊กอินจัดการสคริปต์
- Shopify: วางใน theme layout หรือส่วน Custom Liquid ที่โหลดทั่วทั้งเว็บ
- Next.js: เพิ่มสคริปต์ใน layout หลักของ App Router แล้ว deploy ใหม่
- React/Vite: เพิ่มสคริปต์ใน `index.html` ก่อน `</body>` แล้ว build/deploy ใหม่

`data-prompchat-workspace` คือ public embed ID สำหรับระบุ workspace ไม่ใช่ secret API key ส่วน `data-prompchat-domain` ต้องตรงกับ hostname ที่ลงทะเบียน เช่น `www.example.com`.

วิดเจ็ตโหลดแบบ `async` จึงใส่ใน `<head>` หรือก่อน `</body>` ก็ได้ หากใช้ CSP ให้เพิ่มอย่างน้อย:

```text
script-src ... https://prompchat.vercel.app;
frame-src ... https://prompchat.vercel.app;
```

ถ้าแอปแม่เรียก bootstrap API จากหน้าเว็บโดยตรงในอนาคต ให้เพิ่ม `connect-src https://prompchat.vercel.app` ด้วย ปัจจุบัน visitor API ทำงานใน iframe ของ PrompCHAT จึงไม่ต้องเปิด Supabase host ใน CSP ของเว็บลูกค้า

## 4. ทดสอบ

เปิดเว็บไซต์ที่เผยแพร่แล้วในหน้าต่างใหม่ กดปุ่มแชต ส่งข้อความทดสอบ จากนั้นกลับ PrompCHAT > กล่องข้อความ เพื่อตอบกลับ หากยังไม่เห็นแชต ให้ตรวจ hostname, สถานะตรวจสอบการติดตั้ง และ Console ของหน้าเว็บ

ตัวตรวจติดตั้งเช็ค HTML ที่เผยแพร่, CSP `script-src`/`frame-src` และ `robots.txt` ที่ปิดทั้งเว็บไซต์ หากเว็บตั้ง `Referrer-Policy: no-referrer` หรือ iframe ไม่ส่ง origin ของหน้าที่ฝัง ระบบจะปฏิเสธ visitor เพื่อกันการนำ public embed ID ไปใช้จากโดเมนอื่น

## 5. ตอบไวด้วยคำตอบลัดและ keyword

ไปที่ **ตั้งค่า** เพิ่มข้อความสำเร็จรูปสำหรับแอดมิน และเพิ่มกฎ keyword สำหรับบอท เลือกจับคำบางส่วนหรือให้ตรงทั้งข้อความ แล้วกดบันทึก สามารถ import/export ชุด JSON จากหน้านี้ได้

REST API key และ Webhook สำหรับระบบอื่นเป็นคนละฟีเจอร์กับ embed script; ใช้เฉพาะเมื่อหน้า API ระบุว่าพร้อมใช้งาน และห้ามนำ Supabase service-role key ไปใส่ในโค้ดหน้าเว็บ

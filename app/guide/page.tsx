import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'วิธีใช้งาน PrompCHAT',
  description: 'คู่มือสมัครใช้งาน สร้าง workspace ติดตั้งแชตบนเว็บไซต์ และตอบลูกค้าด้วย PrompCHAT',
};

const installCode = `<script\n  src="https://prompchat.vercel.app/widget.js"\n  data-prompchat-workspace="YOUR_WORKSPACE_KEY"\n  data-prompchat-domain="your-domain.com"\n  async\n></script>`;

export default function GuidePage() {
  return <main className="guide-page">
    <header className="guide-nav"><Link href="/" className="guide-brand"><span className="guide-mark">P</span> PrompCHAT</Link><Link href="/" className="guide-nav-cta">ไปที่แอป <span>→</span></Link></header>
    <article className="guide-content">
      <div className="guide-eyebrow"><span /> คู่มือเริ่มต้นใช้งาน</div>
      <h1>ติดตั้ง PrompCHAT<br /><em>แล้วเริ่มคุยกับลูกค้า</em></h1>
      <p className="guide-intro">ทำตามขั้นตอนนี้เพื่อสร้างแชตของเว็บไซต์คุณ และให้ทีมเริ่มตอบข้อความจากกล่องข้อความกลาง</p>

      <section className="guide-step"><div className="guide-step-number">01</div><div><h2>สมัครและเข้าสู่ระบบ</h2><p>เปิดหน้าแอป กรอกชื่อ อีเมล และรหัสผ่าน หากระบบส่งอีเมลยืนยัน ให้ยืนยันก่อน แล้วกลับมาเข้าสู่ระบบ</p><Link href="/" className="guide-action">สมัครหรือเข้าสู่ระบบ <span>→</span></Link></div></section>
      <section className="guide-step"><div className="guide-step-number">02</div><div><h2>สร้าง workspace ให้เว็บไซต์</h2><p>หลังเข้าสู่ระบบ กรอกชื่อแบรนด์และโดเมน เช่น <code>shop.example.com</code> แต่ละเว็บไซต์ควรมี workspace ของตัวเอง</p></div></section>
      <section className="guide-step"><div className="guide-step-number">03</div><div><h2>ติดตั้งโค้ดบนเว็บ</h2><p>ในเมนู “ติดตั้งบนเว็บไซต์” กด “คัดลอกโค้ดติดตั้ง” แล้ววางสคริปต์ไว้ในส่วน Footer ของเว็บ หรือวางก่อนแท็ก <code>&lt;/body&gt;</code> ในไฟล์ HTML/layout หลัก จากนั้นกดบันทึกและเผยแพร่เว็บไซต์ใหม่</p><pre className="guide-code"><code>{installCode}</code></pre><p className="guide-note">ค่า <code>data-prompchat-workspace</code> เป็น public embed ID ที่ใช้ระบุ workspace สำหรับวิดเจ็ต ไม่ใช่ secret API key และควรคัดลอกโค้ดดิบจากปุ่มในแอป (อย่าคัดลอกจากข้อความที่มีเครื่องหมาย Markdown หรือ HTML entities)</p><p>ใน WordPress ให้ใส่ในช่อง Footer/Custom Code ของธีมหรือปลั๊กอินที่จัดการสคริปต์ส่วนท้าย; ใน Next.js ให้เพิ่ม script ใน layout หลักของแอป; ในเว็บ HTML ให้วางก่อน <code>&lt;/body&gt;</code></p></div></section>
      <section className="guide-step"><div className="guide-step-number">04</div><div><h2>ตรวจการติดตั้ง</h2><p>กลับมาที่หน้า “ติดตั้งบนเว็บไซต์” แล้วกด “ตรวจสอบการติดตั้ง” เมื่อระบบยืนยันโดเมนแล้ว วิดเจ็ตจึงจะเชื่อมต่อและรับแชตได้</p><p>ถ้าตรวจไม่พบ ให้ตรวจว่าโค้ดอยู่บนหน้าแรกของโดเมนที่ลงทะเบียน และเว็บไซต์เผยแพร่หน้าใหม่แล้ว</p></div></section>
      <section className="guide-step"><div className="guide-step-number">05</div><div><h2>ตอบข้อความลูกค้า</h2><p>เปิด “กล่องข้อความ” เพื่อดูข้อความใหม่ คลิกบทสนทนา พิมพ์คำตอบแล้วกด Enter หรือปุ่มส่ง แนบไฟล์และรูปภาพได้จากแถบเครื่องมือ เมื่อจบแล้วเลือก “ปิดการสนทนา”</p></div></section>
      <section className="guide-step"><div className="guide-step-number">06</div><div><h2>ปรับแบรนด์และไอคอน</h2><p>ไปที่ “ตั้งค่า” เพื่อเปลี่ยนชื่อแชต ข้อความต้อนรับ สีหลัก ไอคอนผู้ตอบ และไอคอนลูกค้า แล้วกดบันทึกการเปลี่ยนแปลง</p></div></section>

      <aside className="guide-custom"><h2>ใช้ปุ่มแชตของเว็บไซต์ตัวเอง</h2><p>เลือก “ใช้ปุ่มของเว็บไซต์ฉัน” ตอนคัดลอกโค้ด แล้วเรียกเปิดหน้าต่างด้วยปุ่มของคุณ:</p><pre className="guide-code"><code>{'<button onclick="window.PrompChatWidget.open()">แชตกับเรา</button>'}</code></pre><p>สั่งปิดด้วย <code>window.PrompChatWidget.close()</code> หรือสลับสถานะด้วย <code>window.PrompChatWidget.toggle()</code></p></aside>
      <aside className="guide-custom"><h2>Embed ID กับ Secret API key ต่างกันอย่างไร?</h2><p>สคริปต์ด้านบนคือ JavaScript widget สำหรับแสดงหน้าต่างแชตบนเว็บไซต์ ค่า workspace ID ใช้ระบุเว็บและมองเห็นได้ในหน้าเว็บตามปกติ ส่วน REST API key สำหรับเชื่อมระบบหลังบ้านเป็นคนละอย่าง — ตอนนี้ PrompCHAT ยังไม่มีหน้าออก API key หรือ public conversation REST API/Webhooks ให้ใช้งาน จึงห้ามนำ Supabase service-role key มาใส่ในเว็บลูกค้าเด็ดขาด</p></aside>
      <footer className="guide-footer"><span>ติดขัดระหว่างติดตั้ง?</span><Link href="/">เปิด PrompCHAT <span>→</span></Link></footer>
    </article>
  </main>;
}

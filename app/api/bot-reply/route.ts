export const runtime = 'nodejs';

export async function POST() {
  return Response.json({
    error: 'endpoint_retired',
    message: 'กฎตอบอัตโนมัติจะประมวลผลจาก Supabase หลังตรวจสิทธิ์ visitor และ rate limit แล้ว ไม่รับ triggers ที่ผู้เรียกส่งมาเอง',
    replacement: 'ส่งข้อความผ่าน widget ที่ติดตั้ง แล้วระบบจะตรวจ bot_triggers ฝั่งฐานข้อมูล',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

import type { Metadata } from "next";
import { COMPANY_NAME, CONTACT_EMAIL, DPO_EMAIL, LEGAL_VERSION } from "@/lib/legal/version";

export const metadata: Metadata = {
  title: `นโยบายความเป็นส่วนตัว · ${COMPANY_NAME}`,
  description: `นโยบายความเป็นส่วนตัวของ ${COMPANY_NAME} — สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)`,
};

export default function PrivacyPage() {
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:mt-10 prose-h2:text-xl prose-h3:text-base prose-p:leading-relaxed prose-li:my-1">
      <h1>นโยบายความเป็นส่วนตัว</h1>
      <p className="text-sm text-slate-500">
        มีผลบังคับใช้: 16 เมษายน 2569 · เวอร์ชัน {LEGAL_VERSION}
      </p>

      <p>
        {COMPANY_NAME} (ต่อไปนี้เรียกว่า &ldquo;เรา&rdquo;) ให้ความสำคัญกับความเป็นส่วนตัว
        ของผู้ใช้บริการเป็นอย่างยิ่ง นโยบายนี้อธิบายว่าเราเก็บรวบรวม ใช้ และเปิดเผย
        ข้อมูลส่วนบุคคลของท่านอย่างไร เมื่อท่านใช้งานระบบ {COMPANY_NAME}
        (&ldquo;บริการ&rdquo;) โดยสอดคล้องกับพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
      </p>

      <h2>1. ข้อมูลที่เราเก็บรวบรวม</h2>
      <h3>1.1 ข้อมูลจาก LINE Login</h3>
      <ul>
        <li>LINE User ID, ชื่อที่แสดง (display name), รูปโปรไฟล์</li>
        <li>อีเมล (เฉพาะกรณีที่ท่านอนุญาตใน LINE consent screen)</li>
      </ul>

      <h3>1.2 ข้อมูลจาก Google Account</h3>
      <ul>
        <li>อีเมล Google, ชื่อ, รูปโปรไฟล์</li>
        <li>สิทธิ์เข้าถึง Google Sheets และ Google Drive
          <em>เฉพาะไฟล์ที่ระบบสร้างเอง</em> (scope: <code>drive.file</code>)
          เพื่อสร้างและจัดการสเปรดชีตและโฟลเดอร์ของบริษัทท่าน</li>
      </ul>

      <h3>1.3 ข้อมูลธุรกิจ</h3>
      <ul>
        <li>ชื่อบริษัท เลขประจำตัวผู้เสียภาษี ที่อยู่ เบอร์ติดต่อ โลโก้</li>
        <li>ข้อมูลผู้รับเงิน (Payee) ธนาคาร เหตุการณ์ และรายการค่าใช้จ่าย</li>
        <li>ไฟล์เอกสารแนบ เช่น ใบแจ้งหนี้ ใบเสร็จ</li>
      </ul>

      <h3>1.4 ข้อมูลทางเทคนิค</h3>
      <ul>
        <li>คุกกี้ session (JWT) เพื่อรักษาสถานะการเข้าสู่ระบบ</li>
        <li>บันทึกการใช้งาน (Audit Log) เช่น การอนุมัติรายจ่าย การแก้ไขข้อมูล
          (เก็บเฉพาะ ID และคำสรุปสั้น — ไม่มีจำนวนเงินหรือเนื้อหาใบเสร็จ)</li>
        <li>บันทึกทางเทคนิค (IP, user-agent, timestamps) เก็บใน Vercel logs ≤ 30 วัน</li>
        <li>Cache ของแถวข้อมูลใน Sheets เก็บชั่วคราวใน Upstash Redis (Singapore)
          อายุไม่เกิน 60 วินาที — เพื่อ performance เท่านั้น</li>
      </ul>

      <h2>2. วัตถุประสงค์ในการใช้ข้อมูล</h2>
      <ul>
        <li>เพื่อยืนยันตัวตนและให้บริการระบบบันทึกค่าใช้จ่าย</li>
        <li>เพื่อสร้างและจัดการเอกสารทางบัญชีในบัญชี Google ของท่าน</li>
        <li>เพื่อความปลอดภัย การตรวจสอบ และการป้องกันการใช้งานในทางที่ผิด</li>
        <li>เพื่อพัฒนาและปรับปรุงคุณภาพบริการ</li>
      </ul>

      <h2>3. ฐานทางกฎหมายในการประมวลผล</h2>
      <ul>
        <li><strong>การปฏิบัติตามสัญญา:</strong> เพื่อให้บริการตามที่ตกลงกับผู้ใช้</li>
        <li><strong>ความยินยอม:</strong> สำหรับการเชื่อมต่อ Google/LINE และการรับการแจ้งเตือน</li>
        <li><strong>ประโยชน์โดยชอบด้วยกฎหมาย:</strong> เพื่อความปลอดภัยของระบบและการพัฒนาบริการ</li>
        <li><strong>การปฏิบัติตามกฎหมาย:</strong> เช่น ภาษีอากร และคำขอตามคำสั่งศาล</li>
      </ul>

      <h2>4. การเก็บรักษาข้อมูล</h2>
      <p>
        เราเก็บข้อมูลธุรกิจของท่านไว้ใน Google Sheets และ Google Drive
        <strong>ของท่านเอง</strong> ระบบเก็บเฉพาะข้อมูลที่จำเป็นต่อการให้บริการ
        (ข้อมูลผู้ใช้ องค์กร สิทธิ์การเข้าถึง คำเชิญ และบันทึกการใช้งาน) บนฐานข้อมูล
        ที่ใช้บริการของ Supabase (โซน ap-southeast-1, สิงคโปร์)
      </p>

      <h2>5. การเปิดเผยข้อมูลต่อบุคคลที่สาม</h2>
      <p>เราจะไม่ขายข้อมูลของท่าน เราใช้ผู้ให้บริการต่อไปนี้:</p>
      <ul>
        <li><strong>LINE Corporation</strong> (ญี่ปุ่น) — สำหรับ LINE Login และ LINE Messaging API</li>
        <li><strong>Google LLC</strong> (USA) — สำหรับ OAuth, Sheets, Drive</li>
        <li><strong>Vercel</strong> (USA / Singapore) — hosting + serverless</li>
        <li><strong>Supabase</strong> (Singapore) — ฐานข้อมูล PostgreSQL</li>
        <li><strong>Upstash</strong> (Singapore) — Redis cache (TTL 30 วินาที)</li>
        <li><strong>AksonOCR</strong> (ประเทศไทย) — OCR ใบเสร็จภาษาไทย (ระบบหลัก)</li>
        <li><strong>OpenAI</strong> (USA) — GPT-4o สำหรับ OCR fallback (เปิด/ปิดได้);
          ภาพที่ส่งจะไม่ถูกนำไปฝึกโมเดล</li>
        <li><strong>Sentry</strong> (USA) — error monitoring (ไม่มีเนื้อหาใบเสร็จ)</li>
        <li><strong>Stripe</strong> (USA) — เก็บเงิน subscription (อนาคต — เฉพาะผู้ใช้แพ็คเกจชำระเงิน)</li>
      </ul>
      <p>
        รายชื่อเต็มและสถานที่เก็บข้อมูลอยู่ใน <a href="https://github.com/aim-expense/aim-expense/blob/main/docs/legal/SUB_PROCESSORS.md">SUB_PROCESSORS.md</a>
        บน GitHub — อัพเดตล่าสุดเสมอ
      </p>

      <h2>6. ระยะเวลาการเก็บรักษา</h2>
      <ul>
        <li>ข้อมูลผู้ใช้: ตลอดระยะเวลาที่ท่านยังเป็นสมาชิก</li>
        <li>หลังเลิกใช้งาน: เก็บไว้ 90 วันเพื่อให้ท่านสามารถกู้คืนบัญชีได้ จากนั้นจะลบ</li>
        <li>ข้อมูลในบัญชี Google ของท่าน: ท่านสามารถลบได้เองทุกเมื่อ</li>
      </ul>

      <h2>7. สิทธิของเจ้าของข้อมูล</h2>
      <p>ท่านมีสิทธิตามมาตรา 30-37 PDPA ดังนี้:</p>
      <ul>
        <li>ขอเข้าถึง / ขอสำเนาข้อมูล</li>
        <li>ขอแก้ไขข้อมูลให้ถูกต้อง</li>
        <li>ขอให้ลบหรือระงับการใช้ / ลบบัญชี</li>
        <li>เพิกถอนความยินยอม</li>
        <li>คัดค้านการประมวลผล</li>
        <li>ขอย้ายข้อมูล (data portability)</li>
        <li>ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส. / PDPC)</li>
      </ul>
      <p>
        ใช้สิทธิได้ที่: <a href="/account/data">/account/data</a> ในแอป
        หรือส่งอีเมลถึง <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>
        — เราตอบกลับภายใน 30 วันตามที่ PDPA กำหนด
      </p>

      <h2>8. ความปลอดภัย</h2>
      <ul>
        <li>การสื่อสารทั้งหมดเข้ารหัสด้วย HTTPS/TLS</li>
        <li>โทเคน Google ถูกเข้ารหัสก่อนจัดเก็บ</li>
        <li>Session cookie เป็นแบบ <code>httpOnly</code> และ <code>secure</code></li>
        <li>การเข้าถึงข้อมูลภายในองค์กรควบคุมด้วยระบบสิทธิ์ (Permissions)</li>
      </ul>

      <h2>9. คุกกี้</h2>
      <p>
        เราใช้คุกกี้เพื่อจัดการ session การเข้าสู่ระบบและรักษาสถานะ OAuth flow เท่านั้น
        ไม่ใช้คุกกี้เพื่อการโฆษณาหรือ tracking ข้ามเว็บไซต์
      </p>

      <h2>10. การเปลี่ยนแปลงนโยบาย</h2>
      <p>
        เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว หากมีการเปลี่ยนแปลงสาระสำคัญ
        เราจะแจ้งให้ทราบผ่านระบบ และจะขอความยินยอมใหม่ตามความเหมาะสม
      </p>

      <h2>11. การแจ้งเหตุละเมิด (Breach Notification)</h2>
      <p>
        เราจะแจ้ง สคส. (PDPC) ภายใน <strong>72 ชั่วโมง</strong> เมื่อพบเหตุละเมิดที่
        มีความเสี่ยงต่อสิทธิของเจ้าของข้อมูล. หากเหตุละเมิดมีความเสี่ยงสูงเราจะแจ้งเจ้าของ
        ข้อมูลที่ได้รับผลกระทบโดยตรงด้วย ตามมาตรา 37 PDPA
      </p>

      <h2>12. ติดต่อเจ้าหน้าที่คุ้มครองข้อมูล (DPO)</h2>
      <p>
        หากท่านมีคำถามหรือต้องการใช้สิทธิตาม PDPA โปรดติดต่อ:
        <br />
        DPO อีเมล: <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>
        <br />
        ติดต่อทั่วไป: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}

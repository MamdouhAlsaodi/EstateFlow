const statusItems = [
  { label: "مستحقات قريبة", value: "24,800 ر.س", tone: "status-gold" },
  { label: "متابعات اليوم", value: "08", tone: "status-teal" },
  { label: "بانتظار قرار", value: "03", tone: "status-warning" },
];

const leads = [
  {
    client: "ريم الشمري",
    property: "شقة النخيل · الرياض",
    stage: "بانتظار الاتصال",
    amount: "1,450,000 ر.س",
  },
  {
    client: "فهد العتيبي",
    property: "فيلا الوادي · جدة",
    stage: "معاينة مؤكدة",
    amount: "2,750,000 ر.س",
  },
  {
    client: "سارة الحربي",
    property: "مكتب الواجهة · الدمام",
    stage: "عرض قيد المراجعة",
    amount: "980,000 ر.س",
  },
];

export function DesignSystemDemo() {
  return (
    <div className="page-stack">
      <section className="page-heading" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">مكتبة الواجهة · EF-105</p>
          <h1 id="page-title">أساس عملي لعمليات العقار</h1>
          <p>
            هذا ليس Dashboard جاهزًا؛ بل لغة واجهة عربية موحّدة للمال والمتابعة
            والعقار قبل بناء workflows الحقيقية.
          </p>
        </div>
        <button className="button button-primary" type="button">
          إجراء تجريبي
        </button>
      </section>

      <section aria-label="مؤشرات مختصرة" className="metric-grid">
        <article className="metric-card metric-card-navy">
          <span>النقد المتاح</span>
          <strong className="numeric">126,400 ر.س</strong>
          <small>تحديث توضيحي · اليوم</small>
        </article>
        <article className="metric-card">
          <span>عمولات قيد التحصيل</span>
          <strong className="numeric">42,600 ر.س</strong>
          <small className="positive">↑ 12% من الشهر السابق</small>
        </article>
        <article className="metric-card">
          <span>مهام SLA اليوم</span>
          <strong className="numeric">08</strong>
          <small>4 تحتاج متابعة قبل 16:00</small>
        </article>
      </section>

      <section className="demo-grid" aria-label="عناصر نظام التصميم">
        <article className="panel panel-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">جدول توضيحي</p>
              <h2>قائمة الاستفسارات</h2>
            </div>
            <span className="table-count">3 عناصر</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>العقار</th>
                  <th>المرحلة</th>
                  <th>القيمة المتوقعة</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.client}>
                    <th scope="row">{lead.client}</th>
                    <td>{lead.property}</td>
                    <td>
                      <span className="status-pill">{lead.stage}</span>
                    </td>
                    <td className="numeric">{lead.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">الحالات</p>
          <h2>إشارات لا تعتمد على اللون وحده</h2>
          <ul className="status-list">
            {statusItems.map((item) => (
              <li key={item.label}>
                <span
                  className={`status-dot ${item.tone}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                <strong className="numeric">{item.value}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <p className="eyebrow">النماذج</p>
          <h2>حقل واضح قبل أي workflow</h2>
          <label htmlFor="sample-note">ملاحظة متابعة</label>
          <textarea
            id="sample-note"
            placeholder="اكتب ملخصًا قصيرًا للتواصل القادم"
            rows={3}
          />
          <div className="button-row">
            <button className="button button-primary" type="button">
              حفظ تجريبي
            </button>
            <button className="button button-secondary" type="button">
              إلغاء
            </button>
          </div>
        </article>
      </section>

      <section className="state-grid" aria-label="حالات الواجهة">
        <article className="state-mini">
          <span aria-hidden="true">⌁</span>
          <h2>حالة فارغة</h2>
          <p>لا توجد معاينات مجدولة. أضف معاينة عندما يصبح workflow جاهزًا.</p>
          <button className="text-button" type="button">
            عرض المبدأ
          </button>
        </article>
        <article className="state-mini">
          <span aria-hidden="true">!</span>
          <h2>رسالة خطأ واضحة</h2>
          <p>تعذر حفظ التعديل. تحقق من الحقول المطلوبة ثم أعد المحاولة.</p>
          <button className="text-button" type="button">
            إعادة المحاولة
          </button>
        </article>
      </section>
    </div>
  );
}

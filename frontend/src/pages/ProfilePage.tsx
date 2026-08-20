import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../components/Icon';
import { tutorsApi, type Tutor } from '../api/tutors';
import styles from './ProfilePage.module.css';

const CURRENCIES = [
  { value: 'BYN', label: 'BYN — Белорусский рубль' },
  { value: 'RUB', label: 'RUB — Российский рубль' },
];

const THEMES = [
  { value: 'classic', label: 'Классика' },
  { value: 'modern', label: 'Современный' },
  { value: 'minimal', label: 'Минимализм' },
  { value: 'friendly', label: 'Дружелюбный' },
  { value: 'premium', label: 'Премиум' },
];

interface WorkingHours {
  [key: string]: { enabled: boolean; start: string; end: string };
}

const defaultWorkingHours: WorkingHours = {
  monday: { enabled: true, start: '15:00', end: '20:00' },
  tuesday: { enabled: true, start: '15:00', end: '20:00' },
  wednesday: { enabled: true, start: '15:00', end: '20:00' },
  thursday: { enabled: true, start: '15:00', end: '20:00' },
  friday: { enabled: true, start: '15:00', end: '18:00' },
  saturday: { enabled: true, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '10:00', end: '14:00' },
};

const WEEKDAY_NAMES: Record<string, string> = {
  monday: 'Понедельник',
  tuesday: 'Вторник',
  wednesday: 'Среда',
  thursday: 'Четверг',
  friday: 'Пятница',
  saturday: 'Суббота',
  sunday: 'Воскресенье',
};

const getTimezones = () => {
  try {
    const timezones = Intl.supportedValuesOf('timeZone');
    return timezones.map((tz) => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      });
      const parts = formatter.formatToParts(now);
      const offsetPart = parts.find((p) => p.type === 'timeZoneName');
      const offset = offsetPart?.value || '';
      return { value: tz, label: `${tz.replace(/_/g, ' ')} (${offset})` };
    });
  } catch {
    return [
      { value: 'Europe/Minsk', label: 'Минск (UTC+3)' },
      { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
      { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
      { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
      { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
      { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
      { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
    ];
  }
};

const TIMEZONES = getTimezones();

function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHours;
  onChange: (value: WorkingHours) => void;
}) {
  const handleToggle = (day: string) => {
    const current = value[day] || { enabled: false, start: '09:00', end: '18:00' };
    onChange({
      ...value,
      [day]: { ...current, enabled: !current.enabled },
    });
  };

  const handleTimeChange = (day: string, field: 'start' | 'end', time: string) => {
    const current = value[day] || { enabled: true, start: '09:00', end: '18:00' };
    onChange({
      ...value,
      [day]: { ...current, [field]: time },
    });
  };

  return (
    <div className={styles.workingHoursList}>
      {Object.entries(WEEKDAY_NAMES).map(([key, name]) => {
        const dayData = value[key] || { enabled: false, start: '09:00', end: '18:00' };
        return (
          <div
            key={key}
            className={`${styles.workingHourRow} ${dayData.enabled ? styles.workingHourEnabled : ''}`}
          >
            <label className={styles.workingHourToggle}>
              <input
                type="checkbox"
                checked={dayData.enabled}
                onChange={() => handleToggle(key)}
                className={styles.hiddenCheckbox}
              />
              <span className={styles.workingHourName}>{name}</span>
            </label>

            {dayData.enabled && (
              <div className={styles.workingHourTimes}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={dayData.start}
                  onChange={(e) => handleTimeChange(key, 'start', e.target.value)}
                />
                <span className={styles.timeSeparator}>—</span>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={dayData.end}
                  onChange={(e) => handleTimeChange(key, 'end', e.target.value)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Tutor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // <-- Новое состояние
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await tutorsApi.getMe();
      setProfile(res.data);
    } catch (err) {
      toast.error('Ошибка загрузки профиля');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      await tutorsApi.updateMe(profile);
      toast.success('Профиль сохранён');
      setIsDirty(false); // <-- Сбрасываем флаг после успешного сохранения
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => d.msg).join('; ')
        : typeof detail === 'string'
          ? detail
          : 'Ошибка сохранения';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof Tutor>(field: K, value: Tutor[K]) => {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : null));
    setIsDirty(true); // <-- Помечаем форму как измененную
  };

  const addSubject = () => {
    if (!profile) return;
    const value = newSubject.trim();
    if (!value) return;
    if (profile.subjects.includes(value)) {
      toast.error('Такой предмет уже есть');
      return;
    }
    updateField('subjects', [...profile.subjects, value]);
    setNewSubject('');
  };

  const removeSubject = (subject: string) => {
    if (!profile) return;
    updateField(
      'subjects',
      profile.subjects.filter((s) => s !== subject)
    );
  };

  const handleSubjectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubject();
    }
  };

  const normalizeSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;
  if (!profile) return <div className={styles.empty}>Не удалось загрузить профиль</div>;

  const landingUrl = profile.slug
    ? `${window.location.origin}/t/${profile.slug}`
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Личный кабинет</h1>
        <p className={styles.subtitle}>
          Управляйте профилем, настройками и сайтом-визиткой
        </p>
      </div>

      <form onSubmit={handleSave} className={styles.form}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="user" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Основная информация</h2>
              <p className={styles.cardDescription}>
                Эти данные видят ученики и родители
              </p>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Имя и Фамилия *</label>
              <input
                className={styles.input}
                value={profile.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Телефон</label>
              <input
                className={styles.input}
                value={profile.phone || ''}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+375 (29) 123-45-67"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={profile.email || ''}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="example@mail.com"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Предметы</label>
            <div className={styles.subjectsContainer}>
              <div className={styles.subjectsList}>
                {profile.subjects.length === 0 && (
                  <div className={styles.emptyHint}>
                    Добавьте предметы, которые вы преподаёте
                  </div>
                )}
                {profile.subjects.map((subject) => (
                  <span key={subject} className={styles.subjectChip}>
                    {subject}
                    <button
                      type="button"
                      className={styles.subjectRemove}
                      onClick={() => removeSubject(subject)}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className={styles.subjectInputRow}>
                <input
                  className={styles.input}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onKeyDown={handleSubjectKeyDown}
                  placeholder="Например: Математика"
                />
                <button
                  type="button"
                  className={styles.addSubjectBtn}
                  onClick={addSubject}
                  disabled={!newSubject.trim()}
                >
                  <Icon name="plus" size={16} />
                  Добавить
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="settings" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Рабочие настройки</h2>
              <p className={styles.cardDescription}>
                Часовой пояс и валюта используются в расписании и финансах
              </p>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Часовой пояс</label>
              <select
                className={styles.input}
                value={profile.timezone}
                onChange={(e) => updateField('timezone', e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Валюта</label>
              <select
                className={styles.input}
                value={profile.currency}
                onChange={(e) => updateField('currency', e.target.value)}
              >
                {CURRENCIES.map((cur) => (
                  <option key={cur.value} value={cur.value}>
                    {cur.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="globe" size={20} />
            </div>
            <div className={styles.cardHeaderMain}>
              <div>
                <h2 className={styles.cardTitle}>Мой сайт-визитка</h2>
                <p className={styles.cardDescription}>
                  Персональная страница для привлечения новых учеников
                </p>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={profile.is_landing_published}
                  onChange={(e) => updateField('is_landing_published', e.target.checked)}
                />
                <span className={styles.toggleSlider}></span>
                <span className={styles.toggleText}>
                  {profile.is_landing_published ? 'Опубликован' : 'Скрыт'}
                </span>
              </label>
            </div>
          </div>

          {profile.is_landing_published && landingUrl && (
            <div className={styles.landingPreview}>
              <div className={styles.landingUrlInfo}>
                <Icon name="link" size={16} />
                <span className={styles.landingUrl}>{landingUrl}</span>
              </div>
              <a
                href={landingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.previewBtn}
              >
                Открыть
                <Icon name="external" size={14} />
              </a>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>Адрес страницы (slug)</label>
            <div className={styles.inputWithPrefix}>
              <span className={styles.prefix}>{window.location.origin}/t/</span>
              <input
                className={styles.input}
                style={{ flex: 1 }}
                value={profile.slug || ''}
                onChange={(e) => updateField('slug', normalizeSlug(e.target.value))}
                placeholder="ivan-math"
                minLength={3}
                maxLength={30}
              />
            </div>
            <p className={styles.hint}>
              Только строчные латинские буквы, цифры и дефисы. Например: ivan-math, anna-english
            </p>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Заголовок на сайте</label>
            <input
              className={styles.input}
              value={profile.landing_headline || ''}
              onChange={(e) => updateField('landing_headline', e.target.value)}
              placeholder="Подготовка к ЕГЭ по математике на 90+ баллов"
              maxLength={200}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>О себе</label>
            <textarea
              className={styles.textarea}
              value={profile.landing_bio || ''}
              onChange={(e) => updateField('landing_bio', e.target.value)}
              placeholder="Расскажите о своём опыте, методах работы и достижениях..."
              rows={5}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Тема оформления</label>
            <div className={styles.themesGrid}>
              {THEMES.map((theme) => (
                <label
                  key={theme.value}
                  className={`${styles.themeOption} ${
                    profile.landing_theme === theme.value ? styles.themeOptionActive : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="landing_theme"
                    value={theme.value}
                    checked={profile.landing_theme === theme.value}
                    onChange={() => updateField('landing_theme', theme.value)}
                    className={styles.hiddenRadio}
                  />
                  <span className={styles.themeName}>{theme.label}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="clock" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Рабочие часы</h2>
              <p className={styles.cardDescription}>
                Укажите, в какие дни и во сколько вы готовы проводить занятия
              </p>
            </div>
          </div>

          <WorkingHoursEditor
            value={(profile.settings?.working_hours as WorkingHours) || defaultWorkingHours}
            onChange={(newHours) => {
              setProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      settings: {
                        working_hours: newHours,
                      },
                    }
                  : null
              );
              setIsDirty(true); // <-- Помечаем форму как измененную
            }}
          />
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="briefcase" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Услуги и цены</h2>
              <p className={styles.cardDescription}>
                Опишите форматы занятий и их стоимость
              </p>
            </div>
          </div>

          <div className={styles.listEditor}>
            {(!profile.services || profile.services.length === 0) && (
              <div className={styles.emptyHint}>
                Пока нет услуг. Добавьте первую.
              </div>
            )}
            {profile.services?.map((service, index) => (
              <div key={index} className={styles.listItem}>
                <div className={styles.listItemHeader}>
                  <span className={styles.listItemIndex}>#{index + 1}</span>
                  <button
                    type="button"
                    className={styles.listItemRemove}
                    onClick={() => {
                      const updated = profile.services.filter((_, i) => i !== index);
                      updateField('services', updated);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className={styles.grid2}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Название</label>
                    <input
                      className={styles.input}
                      value={service.title || ''}
                      onChange={(e) => {
                        const updated = [...profile.services];
                        updated[index] = { ...updated[index], title: e.target.value };
                        updateField('services', updated);
                      }}
                      placeholder="Индивидуальное занятие"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Цена ({profile.currency})</label>
                    <input
                      className={styles.input}
                      type="number"
                      value={service.price || ''}
                      onChange={(e) => {
                        const updated = [...profile.services];
                        updated[index] = { ...updated[index], price: Number(e.target.value) };
                        updateField('services', updated);
                      }}
                      placeholder="2500"
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Описание</label>
                  <textarea
                    className={styles.textarea}
                    value={service.description || ''}
                    onChange={(e) => {
                      const updated = [...profile.services];
                      updated[index] = { ...updated[index], description: e.target.value };
                      updateField('services', updated);
                    }}
                    placeholder="Персональная работа один на один..."
                    rows={2}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.addListBtn}
              onClick={() => {
                updateField('services', [
                  ...(profile.services || []),
                  { title: '', description: '', price: 0 },
                ]);
              }}
            >
              <Icon name="plus" size={16} />
              Добавить услугу
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="star" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Отзывы учеников</h2>
              <p className={styles.cardDescription}>
                Добавьте отзывы, которые вам присылали ученики или родители
              </p>
            </div>
          </div>

          <div className={styles.listEditor}>
            {(!profile.testimonials || profile.testimonials.length === 0) && (
              <div className={styles.emptyHint}>
                Пока нет отзывов. Добавьте первый.
              </div>
            )}
            {profile.testimonials?.map((testimonial, index) => (
              <div key={index} className={styles.listItem}>
                <div className={styles.listItemHeader}>
                  <span className={styles.listItemIndex}>#{index + 1}</span>
                  <button
                    type="button"
                    className={styles.listItemRemove}
                    onClick={() => {
                      const updated = profile.testimonials.filter((_, i) => i !== index);
                      updateField('testimonials', updated);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Имя автора</label>
                  <input
                    className={styles.input}
                    value={testimonial.name || ''}
                    onChange={(e) => {
                      const updated = [...profile.testimonials];
                      updated[index] = { ...updated[index], name: e.target.value };
                      updateField('testimonials', updated);
                    }}
                    placeholder="Анна Смирнова"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Текст отзыва</label>
                  <textarea
                    className={styles.textarea}
                    value={testimonial.text || ''}
                    onChange={(e) => {
                      const updated = [...profile.testimonials];
                      updated[index] = { ...updated[index], text: e.target.value };
                      updateField('testimonials', updated);
                    }}
                    placeholder="Благодаря занятиям я сдала ЕГЭ на 94 балла..."
                    rows={3}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.addListBtn}
              onClick={() => {
                updateField('testimonials', [
                  ...(profile.testimonials || []),
                  { name: '', text: '' },
                ]);
              }}
            >
              <Icon name="plus" size={16} />
              Добавить отзыв
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="help-circle" size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Частые вопросы (FAQ)</h2>
              <p className={styles.cardDescription}>
                Ответы на вопросы, которые чаще всего задают родители
              </p>
            </div>
          </div>

          <div className={styles.listEditor}>
            {(!profile.faq || profile.faq.length === 0) && (
              <div className={styles.emptyHint}>
                Пока нет вопросов. Добавьте первый.
              </div>
            )}
            {profile.faq?.map((item, index) => (
              <div key={index} className={styles.listItem}>
                <div className={styles.listItemHeader}>
                  <span className={styles.listItemIndex}>#{index + 1}</span>
                  <button
                    type="button"
                    className={styles.listItemRemove}
                    onClick={() => {
                      const updated = profile.faq.filter((_, i) => i !== index);
                      updateField('faq', updated);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Вопрос</label>
                  <input
                    className={styles.input}
                    value={item.question || ''}
                    onChange={(e) => {
                      const updated = [...profile.faq];
                      updated[index] = { ...updated[index], question: e.target.value };
                      updateField('faq', updated);
                    }}
                    placeholder="Как проходит первое занятие?"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Ответ</label>
                  <textarea
                    className={styles.textarea}
                    value={item.answer || ''}
                    onChange={(e) => {
                      const updated = [...profile.faq];
                      updated[index] = { ...updated[index], answer: e.target.value };
                      updateField('faq', updated);
                    }}
                    placeholder="Первое занятие — диагностическое и бесплатное..."
                    rows={3}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.addListBtn}
              onClick={() => {
                updateField('faq', [
                  ...(profile.faq || []),
                  { question: '', answer: '' },
                ]);
              }}
            >
              <Icon name="plus" size={16} />
              Добавить вопрос
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Icon name="plug" size={20} /> {/* <-- Заменено с bell на plug */}
            </div>
            <div>
              <h2 className={styles.cardTitle}>Интеграции</h2>
              <p className={styles.cardDescription}>
                Подключённые сервисы и уведомления
              </p>
            </div>
          </div>

          <div className={styles.integrationItem}>
            <div className={styles.integrationIcon}>
              <Icon name="telegram" size={24} />
            </div>
            <div className={styles.integrationInfo}>
              <div className={styles.integrationTitle}>Telegram-бот для учеников</div>
              <div className={styles.integrationDesc}>
                Ученики получают напоминания о уроках и домашние задания в Telegram
              </div>
            </div>
            <span className={styles.comingSoon}>Скоро</span>
          </div>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => navigate('/dashboard')}
          >
            Отмена
          </button>
          <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={!isDirty || saving} // <-- Кнопка неактивна, если нет изменений или идет сохранение
          >
            {saving ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </div>
  );
}
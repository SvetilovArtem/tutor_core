import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import Icon from './Icon';
import DateRangeField from './DateRangeField';
import styles from './CreateRuleWizard.module.css';
import { scheduleApi, type DayPreview } from '../api/schedules';

interface CreateRuleWizardProps {
  tutorSubjects: string[];
  students: { id: number; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

type DayDecision = 'accept' | 'skip' | 'replace';

interface DayConfig {
  weekday: number;
  time: string;
  duration: number;
  enabled: boolean;
}

type DayPreviewWithConfig = DayPreview & { weekday: number; time: string; duration: number };

const createDefaultDay = (weekday: number): DayConfig => ({
  weekday,
  time: '10:00',
  duration: 60,
  enabled: false,
});

const getErrorMsg = (err: any) => {
  const detail = err.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => `[${d.loc?.join('.')}] ${d.msg}`).join('; ');
  }
  return typeof detail === 'string' ? detail : 'Ошибка валидации данных (422)';
};

const getEndOfMonth = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return format(new Date(year, month, lastDay), 'yyyy-MM-dd');
};

export default function CreateRuleWizard({ tutorSubjects, students, onClose, onSuccess }: CreateRuleWizardProps) {
  const [step, setStep] = useState(1);
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(WEEKDAYS.map((_, i) => createDefaultDay(i)));
  const [subject, setSubject] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState<string | null>(getEndOfMonth(new Date()));
  
  const [previewDays, setPreviewDays] = useState<DayPreviewWithConfig[]>([]);
  const [dayDecisions, setDayDecisions] = useState<Record<string, DayDecision>>({});
  const [loading, setLoading] = useState(false);

  const toggleDay = (index: number) => {
    setDayConfigs(prev => prev.map((d, i) => 
      i === index ? { ...d, enabled: !d.enabled } : d
    ));
  };

  const updateDayConfig = (index: number, field: 'time' | 'duration', value: string | number) => {
    setDayConfigs(prev => prev.map((d, i) => 
      i === index ? { ...d, [field]: value } : d
    ));
  };

  const toggleStudent = (id: number) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const enabledDays = dayConfigs.filter(d => d.enabled);

  const handlePreview = async () => {
    if (selectedStudentIds.length === 0) {
      toast.error('Выберите хотя бы одного ученика');
      return;
    }
    if (enabledDays.length === 0) {
      toast.error('Включите хотя бы один день недели');
      return;
    }
    
    setLoading(true);
    try {
      let allDays: DayPreviewWithConfig[] = [];
      
      for (const dayConfig of enabledDays) {
        const payload: any = {
          weekday: dayConfig.weekday,
          start_time: `${dayConfig.time}:00`,
          duration_minutes: dayConfig.duration,
          student_ids: selectedStudentIds,
          effective_from: dateFrom,
        };
        
        if (dateTo && dateTo.trim() !== '') {
          payload.effective_to = dateTo;
        }

        const res = await scheduleApi.previewRule(payload);
        
        const daysWithConfig = res.data.days.map(d => ({ 
          ...d, 
          weekday: dayConfig.weekday,
          time: dayConfig.time,
          duration: dayConfig.duration,
        }));
        allDays = [...allDays, ...daysWithConfig];
      }
      
      allDays.sort((a, b) => a.date.localeCompare(b.date));
      setPreviewDays(allDays);
      
      const decisions: Record<string, DayDecision> = {};
      allDays.forEach(day => {
        decisions[day.date] = day.conflict ? 'skip' : 'accept';
      });
      setDayDecisions(decisions);
      
      setStep(2);
    } catch (err: any) {
      toast.error(getErrorMsg(err));
    } finally {
      setLoading(false);
    }
  };
  const setDecision = (date: string, decision: DayDecision) => {
    setDayDecisions(prev => ({ ...prev, [date]: decision }));
  };

  const acceptAllNonConflict = () => {
    const decisions: Record<string, DayDecision> = {};
    previewDays.forEach(day => {
      decisions[day.date] = day.conflict ? 'skip' : 'accept';
    });
    setDayDecisions(decisions);
  };

  const replaceAllConflicts = () => {
    const decisions: Record<string, DayDecision> = {};
    previewDays.forEach(day => {
      decisions[day.date] = 'replace';
    });
    setDayDecisions(decisions);
  };

  const handleCreate = async () => {
    const datesByDayConfig: Record<string, { selected: string[], replace: string[], config: DayConfig }> = {};
    
    enabledDays.forEach(dayConfig => {
      const key = `${dayConfig.weekday}-${dayConfig.time}-${dayConfig.duration}`;
      datesByDayConfig[key] = { selected: [], replace: [], config: dayConfig };
    });

    previewDays.forEach(day => {
      const decision = dayDecisions[day.date];
      if (decision === 'accept' || decision === 'replace') {
        const key = `${day.weekday}-${day.time}-${day.duration}`;
        if (datesByDayConfig[key]) {
          datesByDayConfig[key].selected.push(day.date);
          if (decision === 'replace') {
            datesByDayConfig[key].replace.push(day.date);
          }
        }
      }
    });

    const totalSelected = Object.values(datesByDayConfig).reduce((sum, val) => sum + val.selected.length, 0);
    if (totalSelected === 0) {
      toast.error('Выберите хотя бы один день');
      return;
    }
    
    setLoading(true);
    try {
      let totalCreated = 0;
      let totalReplaced = 0;

      for (const { selected, replace, config } of Object.values(datesByDayConfig)) {
        if (selected.length === 0) continue;

        const res = await scheduleApi.createRuleWithSelectedDays({
          weekday: config.weekday,
          start_time: `${config.time}:00`,
          duration_minutes: config.duration,
          student_ids: selectedStudentIds,
          effective_from: dateFrom,
          effective_to: dateTo || undefined,
          selected_dates: selected,
          replace_dates: replace,
        });
        
        totalCreated += res.data.created_lessons || 0;
        totalReplaced += res.data.replaced_lessons || 0;
      }
      
      const msg = `Правило создано. Уроков создано: ${totalCreated}` + 
                  (totalReplaced > 0 ? `, заменено: ${totalReplaced}` : '');
      toast.success(msg);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(getErrorMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = Object.values(dayDecisions).filter(d => d === 'accept' || d === 'replace').length;
  const conflictCount = previewDays.filter(d => d.conflict).length;
  const replaceCount = Object.values(dayDecisions).filter(d => d === 'replace').length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Создание правила расписания</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.steps}>
          <div className={`${styles.step} ${step >= 1 ? styles.active : ''}`}>
            <span className={styles.stepNum}>1</span>
            <span>Параметры</span>
          </div>
          <div className={`${styles.step} ${step >= 2 ? styles.active : ''}`}>
            <span className={styles.stepNum}>2</span>
            <span>Выбор дней</span>
          </div>
        </div>

        {step === 1 && (
          <div className={styles.content}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ученики *</label>
              <div className={styles.studentPicker}>
                {students.length === 0 ? (
                  <div className={styles.emptyHint}>Нет учеников. Создайте сначала.</div>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className={`${styles.studentChip} ${selectedStudentIds.includes(s.id) ? styles.studentChipActive : ''}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.hiddenCheckbox}
                        checked={selectedStudentIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
              <div className={styles.hint}>
                {selectedStudentIds.length === 0 && 'Выберите учеников'}
                {selectedStudentIds.length === 1 && 'Индивидуальное занятие'}
                {selectedStudentIds.length > 1 && `Групповое занятие (${selectedStudentIds.length} учеников)`}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Предмет</label>
              <select className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Не указан</option>
                {tutorSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Период действия *</label>
              <DateRangeField
                startDate={dateFrom}
                endDate={dateTo}
                onChange={(start, end) => {
                  setDateFrom(start);
                  setDateTo(end);
                }}
              />
            </div>

            <div className={styles.divider}><span className={styles.dividerText}>Дни и время</span></div>

            <div className={styles.daysConfigList}>
              {dayConfigs.map((dayConfig, index) => (
                <div key={index} className={`${styles.dayConfigRow} ${dayConfig.enabled ? styles.dayConfigEnabled : ''}`}>
                  <label className={styles.dayConfigToggle}>
                    <input
                      type="checkbox"
                      checked={dayConfig.enabled}
                      onChange={() => toggleDay(index)}
                      className={styles.hiddenCheckbox}
                    />
                    <span className={`${styles.dayConfigChip} ${dayConfig.enabled ? styles.dayConfigChipActive : ''}`}>
                      {WEEKDAYS[dayConfig.weekday]}
                    </span>
                  </label>
                  
                  {dayConfig.enabled && (
                    <div className={styles.dayConfigFields}>
                      <div className={styles.dayConfigField}>
                        <label className={styles.dayConfigLabel}>Время</label>
                        <input 
                          type="time" 
                          className={styles.dayConfigInput}
                          value={dayConfig.time} 
                          onChange={(e) => updateDayConfig(index, 'time', e.target.value)} 
                        />
                      </div>
                      <div className={styles.dayConfigField}>
                        <label className={styles.dayConfigLabel}>Мин</label>
                        <input 
                          type="number" 
                          className={styles.dayConfigInput}
                          value={dayConfig.duration} 
                          onChange={(e) => updateDayConfig(index, 'duration', Number(e.target.value))}
                          min={15} 
                          step={15} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onClose}>Отмена</button>
              <button 
                className={styles.nextBtn} 
                onClick={handlePreview}
                disabled={loading || selectedStudentIds.length === 0 || enabledDays.length === 0}
              >
                {loading ? 'Загрузка...' : `Далее (${enabledDays.length} дн.) →`}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.content}>
            <div className={styles.previewHeader}>
              <h3>Выберите, что делать с каждым днём</h3>
              <div className={styles.bulkActions}>
                <button className={styles.smallBtn} onClick={acceptAllNonConflict}>
                  Только без конфликтов
                </button>
                {conflictCount > 0 && (
                  <button className={styles.smallBtn} onClick={replaceAllConflicts}>
                    Заменить все конфликты
                  </button>
                )}
              </div>
            </div>

            <div className={styles.daysList}>
              {previewDays.map((day) => {
                const decision = dayDecisions[day.date];
                const isAccepted = decision === 'accept' || decision === 'replace';
                
                return (
                  <div 
                    key={day.date} 
                    className={`${styles.dayItem} ${isAccepted ? styles.accepted : ''} ${day.conflict ? styles.conflict : ''}`}
                  >
                    <div className={styles.dayMain}>
                      <input 
                        type="checkbox" 
                        className={styles.hiddenCheckbox}
                        checked={isAccepted}
                        onChange={() => setDecision(day.date, isAccepted ? 'skip' : 'accept')}
                      />
                      <label className={`${styles.dayChip} ${isAccepted ? styles.dayChipActive : ''}`}>
                        <div className={styles.dayDate}>
                          {format(new Date(day.date), 'EEEE, dd MMMM', { locale: ru })}
                        </div>
                        <div className={styles.dayTime}>
                          {day.time} – {format(new Date(day.start_at), 'HH:mm')} + {day.duration} мин
                        </div>
                      </label>
                    </div>
                    
                    {day.conflict && day.existing_lesson && (
                      <div className={styles.conflictBlock}>
                        <div className={styles.conflictLabel}>
                          <Icon name="close" size={12} />
                          Конфликт с существующим уроком:
                        </div>
                        <div className={styles.existingLesson}>
                          <div className={styles.existingInfo}>
                            <span className={styles.existingTime}>
                              {format(new Date(day.existing_lesson.start_at), 'HH:mm')} – 
                              {format(new Date(day.existing_lesson.end_at), 'HH:mm')}
                            </span>
                            {day.existing_lesson.subject && (
                              <span className={styles.existingSubject}>{day.existing_lesson.subject}</span>
                            )}
                            <span className={styles.existingStudents}>
                              {day.existing_lesson.students.join(', ')}
                            </span>
                          </div>
                        </div>
                        <div className={styles.decisionButtons}>
                          <button 
                            className={`${styles.decisionBtn} ${decision === 'skip' ? styles.decisionBtnActive : ''}`}
                            onClick={() => setDecision(day.date, 'skip')}
                          >
                            Пропустить (оставить старый)
                          </button>
                          <button 
                            className={`${styles.decisionBtn} ${styles.decisionBtnDanger} ${decision === 'replace' ? styles.decisionBtnActive : ''}`}
                            onClick={() => setDecision(day.date, 'replace')}
                          >
                            Заменить старым новым
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.summary}>
              Будет создано: <strong>{selectedCount}</strong> из {previewDays.length} дней
              {replaceCount > 0 && (
                <span className={styles.replaceInfo}> (из них замен: {replaceCount})</span>
              )}
            </div>

            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={() => setStep(1)}>← Назад</button>
              <button 
                className={styles.createBtn} 
                onClick={handleCreate}
                disabled={loading || selectedCount === 0}
              >
                {loading ? 'Создание...' : `Создать (${selectedCount} уроков)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
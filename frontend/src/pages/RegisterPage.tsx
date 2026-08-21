import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tutorsApi } from '../api/tutors';
import styles from './RegisterPage.module.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await tutorsApi.register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phone: formData.phone.trim() || undefined,
        subjects: [],
        timezone: 'Europe/Minsk',
      });

      // Сохраняем токен
      localStorage.setItem('access_token', response.data.access_token);
      
      toast.success('Регистрация успешна! Добро пожаловать.');
      navigate('/profile'); // Или /dashboard, в зависимости от твоей структуры
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Ошибка регистрации. Проверьте данные.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Создать аккаунт</h1>
          <p className={styles.subtitle}>Начните управлять своими занятиями уже сегодня</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Имя и Фамилия *</label>
            <input
              type="text"
              name="name"
              className={styles.input}
              value={formData.name}
              onChange={handleChange}
              placeholder="Иван Петров"
              required
              minLength={2}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Email *</label>
            <input
              type="email"
              name="email"
              className={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="example@mail.com"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Телефон</label>
            <input
              type="tel"
              name="phone"
              className={styles.input}
              value={formData.phone}
              onChange={handleChange}
              placeholder="+375 (29) 123-45-67"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Пароль *</label>
            <input
              type="password"
              name="password"
              className={styles.input}
              value={formData.password}
              onChange={handleChange}
              placeholder="Минимум 6 символов"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? 'Создание аккаунта...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className={styles.footer}>
          <p>
            Уже есть аккаунт?{' '}
            <Link to="/login" className={styles.link}>
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
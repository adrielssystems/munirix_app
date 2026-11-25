'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import SoftAurora from '@/components/ui/SoftAurora';
import SpotlightCard from '@/components/ui/SpotlightCard';
import BlurText from '@/components/ui/BlurText';
import { LogIn, KeyRound, Mail, AlertCircle, Shield, ArrowLeft } from 'lucide-react';
import styles from './login.module.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://munirix.net';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      setError(res.error === 'CredentialsSignin' ? 'Credenciales de Superadmin inválidas.' : res.error);
      setIsLoading(false);
      return;
    }

    router.push('/admin');
    router.refresh();
  };

  return (
    <div className={styles.container}>
      <div className={styles.auroraBg} aria-hidden="true">
        <SoftAurora
          color1="#6366F1"
          color2="#EC4899"
          speed={0.45}
          scale={1.5}
          brightness={0.9}
          bandHeight={0.5}
          bandSpread={1.1}
          opacity={0.78}
        />
      </div>

      <a href={webUrl} className={styles.backLink}>
        <ArrowLeft size={16} />
        <span>Volver a Munirix Web</span>
      </a>

      <SpotlightCard
        className={styles.card}
        spotlightColor="#6366F1"
        intensity={0.22}
        borderGlow={0.75}
      >
        <div className={styles.brand}>
          <img
            src="/brand/Logo_Munirix_sin_fondo.png"
            alt="Munirix"
            width={92}
            height={104}
            style={{ width: 'auto', height: 104, objectFit: 'contain', marginBottom: '0.85rem' }}
          />
          <BlurText
            text="Munirix Admin"
            animateBy="letters"
            delay={40}
            stepDuration={0.28}
            trigger="load"
            className={styles.title}
          />
          <p className={styles.subtitle}>Consola Partner Admin & Core Multitenant (Superadmin)</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.errorMessage} role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="email">Correo Superadmin</label>
            <div className={styles.inputWrapper}>
              <Mail size={17} className={styles.inputIcon} />
              <input
                id="email"
                type="email"
                placeholder="adriels.systems@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Contraseña</label>
            <div className={styles.inputWrapper}>
              <KeyRound size={17} className={styles.inputIcon} />
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? (
              <span className={styles.loader} />
            ) : (
              <>
                <span>Entrar a Partner Admin</span>
                <LogIn size={17} />
              </>
            )}
          </button>
        </form>
      </SpotlightCard>
    </div>
  );
}

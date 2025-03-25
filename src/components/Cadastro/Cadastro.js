// src/components/Cadastro/Cadastro.js
import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import styles from './Cadastro.module.css';
import { useNavigate } from 'react-router-dom';

function Cadastro() {
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [telefone, setTelefone] = useState('');
    const [idade, setIdade] = useState('');
    const [senha, setSenha] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    

    const handleCadastro = async (e) => {
        e.preventDefault();
        setError('');

         if (!/^\d+$/.test(idade)) {
          setError('A idade deve ser um número.');
          return;
        }

       if(parseInt(idade) < 18){
         setError("Você deve ter mais de 18 anos")
       }
         const phoneRegex = /^(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-.\s]?\d{4})$/;
        if (!phoneRegex.test(telefone)) {
            setError("Formato de telefone inválido. Use apenas números (10 ou 11 dígitos).");
             return
        }


        try {

            const { user } = await createUserWithEmailAndPassword(auth, email, senha);


            await api.registrarUsuario(user.uid, {
                nome,
                email,
                telefone,
                idade: parseInt(idade, 10),
            });

            navigate('/dashboard')
        } catch (authError) {
          console.error("Erro no cadastro:", authError);


          if (authError.code === 'auth/email-already-in-use') {
              setError('Este email já está cadastrado.');
          } else if (authError.code === "auth/weak-password") {
              setError("A senha deve ter no mínimo 6 caracteres.");
          }
           else if(authError.code === 'auth/invalid-email'){
              setError("Email inválido")
           }
           else {
              setError('Erro ao cadastrar. Por favor, tente novamente.');
          }
        }
    };


    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user && user.email !== "adm@adm.com") {
                navigate('/dashboard');
            }
            else if (user && user.email === "adm@adm.com"){
                navigate('/admin-dashboard')
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    return (
        <div className={styles.container}>
            <form className={styles.form} onSubmit={handleCadastro}>
                <h2 className={styles.title}>Cadastro</h2>

                <label className={styles.label}>
                  Nome:
                <input
                    className={styles.input}
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                />
                </label>

                <label className={styles.label}>
                   Email:
                <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                  </label>

                <label className={styles.label}>
                   Telefone:
                <input
                    className={styles.input}
                    type="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    required
                />
                </label>

                <label className={styles.label}>
                  Idade:
                <input
                    className={styles.input}
                    type="number"
                    value={idade}
                    onChange={(e) => setIdade(e.target.value)}
                    required
                />
                </label>

                <label className={styles.label}>
                   Senha:
                <input
                    className={styles.input}
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                />
                  </label>
                <button className={styles.button} type="submit">Cadastrar</button>
                {error && <p className={styles.errorMessage}>{error}</p>}
                <button type="button" className={styles.button} onClick={() => navigate('/login')}>
                    Já tem uma conta? Faça Login
                </button>
            </form>
        </div>
    );
}

export default Cadastro;

import { supabase } from './supabase.js';

const signupForm = document.getElementById('signup-form');
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) {
    alert(error.message);
  } else {
    alert('Cadastro realizado! Verifique seu e-mail para confirmar.');
    window.location.href = '/login.html';
  }
});


-- Promove o PRIMEIRO usuário a Gestor. Rode no SQL Editor do Supabase
-- depois de criar o usuário em Authentication > Users > Add user.
-- Troque o e-mail e o nome abaixo.
update perfis
   set papel = 'gestor', nome = 'Gustavo Sipião'
 where email = 'gustavo.sipiao@triunfologistica.com.br';

-- Vincula o login à lista de responsáveis (para aparecer como "você" nas atividades)
update pessoas
   set perfil_id = (select id from perfis where email = 'gustavo.sipiao@triunfologistica.com.br'),
       email = 'gustavo.sipiao@triunfologistica.com.br'
 where nome = 'Gustavo Sipião';

select nome, email, papel from perfis;

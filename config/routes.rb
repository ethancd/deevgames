DeevGamesDevelopment::Application.routes.draw do
  resource :root, only: [:index]
  root to: "root#index"

  resources :posts
  resources :comments, only: [:create, :update, :destroy]

  resources :users, only: [:new, :create, :show, :edit, :update]
  resource :session, only: [:create, :destroy]

  namespace :njt do
    resource :lobby, only: [:index]
    resources :rules, only: [:show]
    resources :games, only: [:new, :create, :show, :update]
    resources :replays, only: [:index, :show]
  end
end

DeevGamesDevelopment::Application.routes.draw do
  devise_for :users

  root to: "splash#in"
  get "not_logged_in", to: "splash#out", as: :out

  resource :guest, only: [:create, :edit, :destroy]
  resources :feedback, only: [:new, :create, :index, :destroy]

  get "blog", to: "posts#index", as: :blog
  resources :posts do
    resources :comments, only: [:index, :create, :update, :destroy]
    post "comments/:id", to: "comments#undestroy"
  end

  namespace :njt do
    get "/", to: "splash#index", as: :splash
    resources :feedback, only: [:new]
    resources :rules, only: [:show]
    resources :games, only: [:create, :show, :update, :destroy] do
      resources :comments, only: [:create]
      delete "gameover", to: "games#gameover"
      get "pregame", to: "games#pregame"
    end
    post "enqueue", to: "games#enqueue"
  end
end

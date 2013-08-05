DeevGamesDevelopment::Application.routes.draw do
  devise_for :users

  root to: "posts#index"

  get "blog", to: "posts#index", as: :blog
  resources :posts do
    resources :comments, only: [:index, :create, :update, :destroy]
  end

  resources :sessions, only: [:new]

  namespace :njt do
    get "/", to: "lobby#index", as: :lobby
    resources :rules, only: [:show]
    resources :games, only: [:new, :create, :show, :update]
    resources :replays, only: [:index, :show]
  end

  namespace :blnd do
    get "/", to: "lobby#index", as: :lobby
  end

  namespace :hex do
    get "/", to: "lobby#index", as: :lobby
  end

end

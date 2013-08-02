DeevGamesDevelopment::Application.routes.draw do
  resource :root, only: [:index]

  resources :posts do
    resources :comments, only: [:create, :update, :destroy, :index]
  end

  resources :users, only: [:new, :create]
  resource :session, only: [:create, :destroy]


end

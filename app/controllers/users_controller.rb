class UsersController < ApplicationController

  before_filter :auth_only!, only: [:edit, :update, :destroy]

  def new
    @user = User.new
  end

  def create
    @user = User.new(params[:user])
    @user.author_id = current_user.id

    if @user.save
      redirect_to users_url
    else
      render :new
    end
  end

  def show
    @user = User.find(params[:id])
  end

  def edit
    @user = User.find(params[:id])
  end

  def update
    @user = User.find(params[:id])
    if @user.update_attributes(params[:user])
      redirect_to users_url
    else
      render :edit
    end
  end

  def destroy
    @user = User.find(params[:id])
    @user.destroy

    redirect_to users_url
  end

  private
  def auth_only!
    unless current_user.admin || current_user == User.find(params[:id])
      flash = "Access denied"
      redirect_to :root
    end
  end


end

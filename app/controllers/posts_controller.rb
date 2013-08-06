class PostsController < ApplicationController

  before_filter :auth_only!, only: [:new, :create, :edit, :update, :destroy]

  def index
    @posts = Post.order("id desc").page(params[:page]).per(5)
  end

  def show
    @post = Post.find(params[:id])
    @comments = @post.comments
  end

  def new
    @post = Post.new
  end

  def create
    @post = Post.new(params[:post])
    @post.author_id = current_user.id

    if @post.save
      redirect_to posts_url
    else
      render :new
    end
  end

  def edit
    @post = Post.find(params[:id])
  end

  def update
    @post = Post.find(params[:id])
    if @post.update_attributes(params[:post])
      redirect_to posts_url
    else
      render :edit
    end
  end

  def destroy
    @post = Post.find(params[:id])
    @post.destroy

    redirect_to posts_url
  end

end

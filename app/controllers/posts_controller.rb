class PostsController < ApplicationController

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

  def index
    @posts = Post.all
  end

  def show
    @post = Post.find(params[:id])
  end

  def destroy
    @post = Post.find(params[:id])
    @post.destroy

    redirect_to posts_url
  end

end

class CommentsController < ApplicationController
  def create
    @comment = Comment.new(params[:comment])
    @comment.author_id = current_user.id

    if @comment.save
      redirect_to comments_url
    else
      render :new
    end
  end

  def update
    @comment = Comment.find(params[:id])
    if @comment.update_attributes(params[:comment])
      redirect_to comments_url
    else
      render :edit
    end
  end

  def destroy
    @comment = Comment.find(params[:id])
    @comment.destroy

    redirect_to comments_url
  end

end
